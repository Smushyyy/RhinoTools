#!/usr/bin/env node
/**
 * Generates and installs a Stream Deck V3 profile for Rhino 3D Tools.
 * Uses official Rhino SVG icons composited onto category-coloured backgrounds.
 *
 * Usage:  node generate-profile.mjs
 * Then:   restart Stream Deck software to see the "Rhino 3D Tools" profile
 */

import { deflateSync }                                              from "zlib";
import { mkdirSync, writeFileSync, existsSync,
         readdirSync, readFileSync, rmSync }                        from "fs";
import { join }                                                     from "path";
import { fileURLToPath }                                            from "url";
import { dirname }                                                  from "path";
import { randomUUID }                                               from "crypto";
import { Resvg }                                                    from "@resvg/resvg-js";
import { PNG }                                                      from "pngjs";

const __dirname    = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(process.env.APPDATA, "Elgato", "StreamDeck", "ProfilesV3");
const SVG_DIR      = "C:/Users/Phili/Documents/Claude/Code & Cowork/rhino_svgs";
const PNG_DIR      = "C:/Users/Phili/Documents/Claude/Code & Cowork/rh4icons_32_iconimages";
const COLS = 5, ROWS = 3;
const CMD_SLOTS = COLS * ROWS - 2;   // 13 — reserve bottom-left & bottom-right for nav

// ─── Device info from an existing SD profile ─────────────────────────────────

let deviceModel = "20GBA9901";
let deviceUUID  = "";

try {
    for (const entry of readdirSync(PROFILES_DIR)) {
        const mPath = join(PROFILES_DIR, entry, "manifest.json");
        if (!existsSync(mPath)) continue;
        const m = JSON.parse(readFileSync(mPath, "utf8"));
        if (m.Device?.Model?.match(/^20G/)) {
            deviceModel = m.Device.Model;
            deviceUUID  = m.Device.UUID;
            break;
        }
    }
} catch { /* use defaults */ }

// ─── SVG → PNG compositing ────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

const pngChunk = (type, data) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.allocUnsafe(4);
    const crcBuf = Buffer.allocUnsafe(4);
    len.writeUInt32BE(data.length, 0);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
};

function rgbaToPNG(rgba, W, H) {
    const raw = Buffer.alloc(H * (1 + W * 3));
    for (let y = 0; y < H; y++) {
        raw[y * (1 + W * 3)] = 0;
        for (let x = 0; x < W; x++) {
            const s = (y * W + x) * 4, d = y * (1 + W * 3) + 1 + x * 3;
            raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
        }
    }
    const ihdr = Buffer.allocUnsafe(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function inRRect(x, y, x0, y0, x1, y1, r) {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const c = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    if (x < x0 + r && y < y0 + r) return c(x0 + r, y0 + r);
    if (x > x1 - r && y < y0 + r) return c(x1 - r, y0 + r);
    if (x < x0 + r && y > y1 - r) return c(x0 + r, y1 - r);
    if (x > x1 - r && y > y1 - r) return c(x1 - r, y1 - r);
    return true;
}

const W = 72, H = 72, ICON_SIZE = 44;

/** Composite RGBA pixel block (iW×iH) onto the background buffer, centred */
function compositePixels(rgba, px, iW, iH) {
    const offX = Math.floor((W - iW) / 2);
    const offY = Math.floor((H - iH) / 2);
    for (let iy = 0; iy < iH; iy++) {
        for (let ix = 0; ix < iW; ix++) {
            const si = (iy * iW + ix) * 4;
            const alpha = px[si + 3] / 255;
            if (alpha < 0.01) continue;
            const dx = ix + offX, dy = iy + offY;
            if (dx < 0 || dx >= W || dy < 0 || dy >= H) continue;
            const di = (dy * W + dx) * 4;
            rgba[di]     = Math.round(px[si]     * alpha + rgba[di]     * (1 - alpha));
            rgba[di + 1] = Math.round(px[si + 1] * alpha + rgba[di + 1] * (1 - alpha));
            rgba[di + 2] = Math.round(px[si + 2] * alpha + rgba[di + 2] * (1 - alpha));
        }
    }
}

/**
 * Build a 72×72 PNG: coloured rounded-rect background + Rhino icon.
 * iconRef can be:
 *   { type:"svg", name:"Line" }        — from rhino_svgs/ (recoloured white)
 *   { type:"png", name:"EdgeSrf" }     — from rh4icons_32_iconimages/ (used as-is)
 */
function makeIcon(r, g, b, iconRef) {
    const BG = [0x18, 0x18, 0x18];
    const rgba = new Uint8Array(W * H * 4);

    // Fill background
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const inBg = inRRect(x, y, 5, 5, 67, 67, 11);
            rgba[i]     = inBg ? r : BG[0];
            rgba[i + 1] = inBg ? g : BG[1];
            rgba[i + 2] = inBg ? b : BG[2];
            rgba[i + 3] = 255;
        }
    }

    if (iconRef) {
        try {
            if (iconRef.type === "svg") {
                const svgPath = join(SVG_DIR, `${iconRef.name}.svg`);
                if (existsSync(svgPath)) {
                    let svgSrc = readFileSync(svgPath, "utf8");
                    svgSrc = svgSrc
                        .replace(/stroke="black"/gi,   'stroke="white"')
                        .replace(/stroke="#000000"/gi, 'stroke="white"')
                        .replace(/stroke="#000"/gi,    'stroke="white"')
                        .replace(/fill="black"/gi,     'fill="white"')
                        .replace(/fill="#000000"/gi,   'fill="white"')
                        .replace(/fill="#000"/gi,      'fill="white"');
                    const resvg    = new Resvg(svgSrc, { fitTo: { mode: "width", value: ICON_SIZE } });
                    const rendered = resvg.render();
                    compositePixels(rgba, rendered.pixels, rendered.width, rendered.height);
                }
            } else if (iconRef.type === "png") {
                const pngPath = join(PNG_DIR, `${iconRef.name}.png`);
                if (existsSync(pngPath)) {
                    const raw  = readFileSync(pngPath);
                    const img  = PNG.sync.read(raw);
                    // Scale up from 32×32 to ICON_SIZE×ICON_SIZE using nearest-neighbour
                    const scale = ICON_SIZE / Math.max(img.width, img.height);
                    const iW = Math.round(img.width  * scale);
                    const iH = Math.round(img.height * scale);
                    const scaled = new Uint8Array(iW * iH * 4);
                    for (let iy = 0; iy < iH; iy++) {
                        for (let ix = 0; ix < iW; ix++) {
                            const sx = Math.floor(ix / scale);
                            const sy = Math.floor(iy / scale);
                            const si = (sy * img.width + sx) * 4;
                            const di = (iy * iW + ix) * 4;
                            scaled[di]     = img.data[si];
                            scaled[di + 1] = img.data[si + 1];
                            scaled[di + 2] = img.data[si + 2];
                            scaled[di + 3] = img.data[si + 3];
                        }
                    }
                    compositePixels(rgba, scaled, iW, iH);
                }
            }
        } catch { /* icon error — use plain colour */ }
    }

    return rgbaToPNG(rgba, W, H);
}

// ─── Category colours ─────────────────────────────────────────────────────────

const COLORS = {
    "Draw — Curves":       [0x2d, 0x6e, 0xa4],
    "Draw — Surfaces":     [0x1a, 0x87, 0x8a],
    "Draw — Solids":       [0x1a, 0x6e, 0x5c],
    "Modify — Edit":       [0x8a, 0x3d, 0x2d],
    "Modify — Transform":  [0x8a, 0x5c, 0x1a],
    "Modify — Solids":     [0x8a, 0x1a, 0x3d],
    "Modify — Mesh":       [0x5c, 0x1a, 0x8a],
    "SubD":                [0x3d, 0x6e, 0x1a],
    "Analyze":             [0x6e, 0x1a, 0x8a],
    "Drafting":            [0x1a, 0x5c, 0x8a],
    "View":                [0x8a, 0x8a, 0x1a],
    "Display":             [0x1a, 0x2d, 0x8a],
    "Selection":           [0x3a, 0x8a, 0x1a],
    "File":                [0x5c, 0x5c, 0x5c],
};

// ─── Icon mapping (command → { type, name }) ─────────────────────────────────
// type "svg" = rhino_svgs folder (recoloured white)
// type "png" = rh4icons_32_iconimages folder (used as-is, scaled up)

const svg = name => ({ type: "svg", name });
const png = name => ({ type: "png", name });

const ICON_MAP = {
    // Draw — Curves
    "_Line":             svg("Line"),
    "_Polyline":         svg("Polyline"),
    "_Curve":            svg("Curve"),
    "_Arc":              svg("Arc"),
    "_Circle":           svg("Circle"),
    "_Ellipse":          svg("Ellipse"),
    "_Rectangle":        svg("Rectangle"),
    "_Polygon":          svg("Polygon"),
    "_Helix":            svg("Helix"),
    "_Spiral":           svg("Spiral"),
    "_InterpCrv":        svg("InterpCrv"),
    "_Sketch":           svg("Sketch"),
    "_Point":            svg("Point"),

    // Draw — Surfaces
    "_Plane":            svg("Plane"),
    "_EdgeSrf":          png("EdgeSrf"),
    "_Loft":             svg("SubDLoft"),
    "_Sweep1":           svg("Sweep1"),
    "_Sweep2":           svg("Sweep2"),
    "_Revolve":          svg("Revolve"),
    "_NetworkSrf":       png("NetworkSrf"),
    "_PlanarSrf":        png("PlanarSrf"),
    "_Patch":            svg("Surface_Patch"),
    "_ExtrudeCrv":       svg("Extrude"),
    "_ExtrudeSrf":       png("ExtrudeSrf"),
    "_OffsetSrf":        svg("Surface_Tools_Offset_Surface"),

    // Draw — Solids
    "_Box":              svg("Box"),
    "_Sphere":           svg("Sphere"),
    "_Cylinder":         svg("Solids_Sidebar_Solid_Creation_Cylinder"),
    "_Cone":             svg("Solids_Sidebar_Solid_Creation_Cone"),
    "_TCone":            svg("Mesh_Creation_Mesh_TCone"),
    "_Torus":            svg("Solids_Sidebar_Solid_Creation_Torus"),
    "_Pipe":             svg("Solids_Sidebar_Pipe"),

    // Modify — Edit
    "_Trim":             svg("Trim"),
    "_Split":            svg("Split"),
    "_Extend":           svg("Extend"),
    "_Join":             svg("Geometry_Fix_Main1_Join"),
    "_Explode":          svg("Geometry_Fix_Main2_Explode"),
    "_Offset":           svg("Offset"),
    "_Fillet":           svg("Fillet"),
    "_Chamfer":          svg("Chamfer"),
    "_Rebuild":          svg("Rebuild_Curve"),
    "_Match":            svg("Match"),
    "_Fair":             svg("Fair"),
    "_SimplifyCrv":      svg("SimplifyCrv"),
    "_Project":          svg("Curve_From_Object_Curve Tools_Main1_Project_curves"),
    "_Pull":             svg("Curve_From_Object_Pull_curve"),

    // Modify — Transform
    "_Move":             svg("Move"),
    "_Copy":             svg("CopyObjectsToLayer"),
    "_Rotate":           svg("Rotate"),
    "_ArrayCrv":         png("ArrayCrv"),
    "_Scale":            svg("Scale"),
    "_Scale1D":          svg("Scale1D"),
    "_Scale2D":          svg("Scale2D"),
    "_Mirror":           svg("Mirror"),
    "_Array":            svg("Array"),
    "_ArrayPolar":       svg("ArrayPolar"),
    "_Orient":           svg("Orient"),
    "_OrientOnSrf":      svg("Transform_Orient_on_surface"),
    "_Bend":             svg("Bend"),
    "_Twist":            svg("Transform_Deformation_Tools_Twist"),
    "_Taper":            svg("Transform_Deformation_Tools_Taper"),
    "_Shear":            svg("Transform_Shear"),
    "_Flow":             svg("Deformation_Tools_Flow along_curve"),

    // Modify — Solids
    "_BooleanUnion":        svg("Solid_Boolean_union"),
    "_BooleanDifference":   svg("BooleanDifference"),
    "_BooleanIntersection": svg("BooleanIntersection"),
    "_BooleanSplit":        svg("Solid_Tools_Boolean_split"),
    "_FilletEdge":          svg("Solid_Tools_Fillet_edges"),
    "_ChamferEdge":         svg("Solid_Tools_Chamfer_Edges"),
    "_Shell":               svg("Solid_Shell"),
    "_Cap":                 svg("CapPlanarHoles"),
    "_ExtractSrf":          svg("ExtractSurface"),
    "_MergeAllFaces":       svg("Mesh_Tools_Merge_Faces"),

    // Modify — Mesh
    "_Mesh":             svg("Mesh_Creation"),
    "_Weld":             svg("Weld"),
    "_UnifyMeshNormals": svg("UnifyMeshNormals"),
    "_ReduceMesh":       svg("ReduceMesh"),
    "_Smooth":           svg("Smooth"),
    "_QuadRemesh":       svg("QuadRemesh"),

    // SubD
    "_SubDBox":          svg("SubD_box"),
    "_SubDCylinder":     svg("SubD_cylinder"),
    "_SubDSphere":       svg("SubDSphere"),
    "_Crease":           svg("Mesh_Utilities_SubD_Crease"),
    "_RemoveCrease":     svg("Mesh_Utilities_SubD_Remove_crease"),
    "_ToNURBS":          svg("ToNURBS"),
    "_ToSubD":           svg("ToSubD"),
    "_InsertEdge":       svg("InsertEdge"),
    "_Bridge":           svg("Bridge"),
    "_Stitch":           svg("Stitch"),

    // Analyze
    "_Length":           svg("Length"),
    "_Area":             svg("AreaCentroid"),
    "_Volume":           svg("Volume"),
    "_Distance":         svg("Distance"),
    "_Angle":            svg("Angle"),
    "_BoundingBox":      png("BoundingBox"),
    "_Zebra":            svg("Surface_Analysis_Zebra_analysis"),
    "_CurvatureAnalysis":svg("Curvature"),
    "_DraftAngleAnalysis":svg("DraftAngleAnalysis"),
    "_EMap":             svg("TextureMappingUnwrap"),
    "_Check":            svg("Check"),
    "_What":             svg("DocumentProperties"),

    // Drafting
    "_Dim":              svg("Dim"),
    "_DimAligned":       svg("DimAligned"),
    "_DimAngle":         svg("DimAngle"),
    "_DimRadius":        png("DimRadius"),
    "_DimDiameter":      svg("DimDiameter"),
    "_Text":             svg("EditText"),
    "_Leader":           svg("Leader"),
    "_Hatch":            svg("Hatch"),
    "_ClippingPlane":    svg("ClippingSection"),

    // View
    "_Zoom _All _Extents": svg("ZoomExtents"),
    "_Zoom _Selected":     svg("ZoomSelected"),
    "_4View":              png("4View"),
    "_MaxViewport":        svg("Maximize_restore_viewport"),
    "_NamedView":          svg("SaveNamedView"),
    "_SetView _World _Top":         svg("CPlaneTop"),
    "_SetView _World _Front":       svg("Set_View_Render_Sidebar_Front_view"),
    "_SetView _World _Right":       svg("CPlaneRight"),
    "_SetView _World _Perspective": svg("Render_Sidebar_Perspective_view"),
    "_SetView _World _Bottom":      svg("Set_View_Render_Sidebar_Bottom_view"),
    "_SetView _World _Left":        svg("CPlaneLeft"),

    // Display
    "_SetDisplayMode _Mode=Wireframe": svg("WireframeViewport"),
    "_SetDisplayMode _Mode=Shaded":    svg("ShadedViewport"),
    "_SetDisplayMode _Mode=Rendered":  svg("RenderedViewport"),
    "_SetDisplayMode _Mode=Ghosted":   svg("Display_Ghosted_viewport"),
    "_SetDisplayMode _Mode=X-Ray":     svg("Display_XRay_viewport"),
    "_SetDisplayMode _Mode=Arctic":    svg("Arctic_Mode"),
    "_SetDisplayMode _Mode=Technical": svg("TechnicalDisplay"),
    "_Hide":             svg("Geometry_Fix_Organic_Hide_objects"),
    "_Show":             svg("Show"),
    "_Lock":             svg("Lock"),
    "_Unlock":           svg("UnlockSelected"),

    // Selection
    "_SelAll":           svg("SelAll"),
    "_SelNone":          svg("SelNone"),
    "_SelInvert":        svg("Invert_selection_and_hide_control_points"),
    "_SelCrv":           svg("Select_Curves"),
    "_SelSrf":           svg("Select_Surfaces"),
    "_SelPolysrf":       svg("Select_Polysurfaces"),
    "_SelMesh":          svg("SelMesh"),
    "_SelSubD":          svg("SelSubDEdges"),
    "_SelLayer":         svg("SelLayer"),
    "_SelDup":           svg("SelDup"),
    "_SelPrev":          svg("Select_previous_selection"),

    // File
    "_Save":             svg("Save"),
    "_SaveAs":           svg("SaveAs"),
    "_Import":           svg("File_Open"),
    "_Export":           svg("File_Export"),
    "_Render":           svg("Render_Tools_Standard_Render"),
    "_Undo":             svg("Undo"),
    "_Redo":             svg("Geometry_Fix_Standard_Redo"),
};

// ─── Tool catalogue ───────────────────────────────────────────────────────────

const CATALOGUE = [
    { label: "Draw — Curves", tools: [
        { label: "Line",              command: "_Line" },
        { label: "Polyline",          command: "_Polyline" },
        { label: "Free-form Curve",   command: "_Curve" },
        { label: "Arc",               command: "_Arc" },
        { label: "Circle",            command: "_Circle" },
        { label: "Ellipse",           command: "_Ellipse" },
        { label: "Rectangle",         command: "_Rectangle" },
        { label: "Polygon",           command: "_Polygon" },
        { label: "Helix",             command: "_Helix" },
        { label: "Spiral",            command: "_Spiral" },
        { label: "Interpolate Pts",   command: "_InterpCrv" },
        { label: "Sketch",            command: "_Sketch" },
        { label: "Point",             command: "_Point" },
    ]},
    { label: "Draw — Surfaces", tools: [
        { label: "Plane",             command: "_Plane" },
        { label: "Edge Surface",      command: "_EdgeSrf" },
        { label: "Loft",              command: "_Loft" },
        { label: "Sweep 1 Rail",      command: "_Sweep1" },
        { label: "Sweep 2 Rails",     command: "_Sweep2" },
        { label: "Revolve",           command: "_Revolve" },
        { label: "Rail Revolve",      command: "_RailRevolve" },
        { label: "Network Surface",   command: "_NetworkSrf" },
        { label: "Planar Surface",    command: "_PlanarSrf" },
        { label: "Patch",             command: "_Patch" },
        { label: "Extrude Curve",     command: "_ExtrudeCrv" },
        { label: "Extrude Surface",   command: "_ExtrudeSrf" },
        { label: "Offset Surface",    command: "_OffsetSrf" },
    ]},
    { label: "Draw — Solids", tools: [
        { label: "Box",               command: "_Box" },
        { label: "Sphere",            command: "_Sphere" },
        { label: "Cylinder",          command: "_Cylinder" },
        { label: "Cone",              command: "_Cone" },
        { label: "Truncated Cone",    command: "_TCone" },
        { label: "Torus",             command: "_Torus" },
        { label: "Pipe",              command: "_Pipe" },
    ]},
    { label: "Modify — Edit", tools: [
        { label: "Trim",              command: "_Trim" },
        { label: "Split",             command: "_Split" },
        { label: "Extend",            command: "_Extend" },
        { label: "Join",              command: "_Join" },
        { label: "Explode",           command: "_Explode" },
        { label: "Offset Curve",      command: "_Offset" },
        { label: "Fillet Curves",     command: "_Fillet" },
        { label: "Chamfer Curves",    command: "_Chamfer" },
        { label: "Rebuild Curve",     command: "_Rebuild" },
        { label: "Match Curves",      command: "_Match" },
        { label: "Fair Curve",        command: "_Fair" },
        { label: "Simplify Curve",    command: "_SimplifyCrv" },
        { label: "Project Curve",     command: "_Project" },
        { label: "Pull Curve",        command: "_Pull" },
    ]},
    { label: "Modify — Transform", tools: [
        { label: "Move",              command: "_Move" },
        { label: "Copy",              command: "_Copy" },
        { label: "Rotate",            command: "_Rotate" },
        { label: "Rotate 3D",         command: "_Rotate3D" },
        { label: "Scale",             command: "_Scale" },
        { label: "Scale 1D",          command: "_Scale1D" },
        { label: "Scale 2D",          command: "_Scale2D" },
        { label: "Mirror",            command: "_Mirror" },
        { label: "Array Linear",      command: "_Array" },
        { label: "Array Polar",       command: "_ArrayPolar" },
        { label: "Array Along Crv",   command: "_ArrayCrv" },
        { label: "Orient",            command: "_Orient" },
        { label: "Orient on Srf",     command: "_OrientOnSrf" },
        { label: "Flow Along Crv",    command: "_Flow" },
        { label: "Bend",              command: "_Bend" },
        { label: "Twist",             command: "_Twist" },
        { label: "Taper",             command: "_Taper" },
        { label: "Shear",             command: "_Shear" },
    ]},
    { label: "Modify — Solids", tools: [
        { label: "Boolean Union",     command: "_BooleanUnion" },
        { label: "Boolean Diff",      command: "_BooleanDifference" },
        { label: "Boolean Intersect", command: "_BooleanIntersection" },
        { label: "Boolean Split",     command: "_BooleanSplit" },
        { label: "Fillet Edge",       command: "_FilletEdge" },
        { label: "Chamfer Edge",      command: "_ChamferEdge" },
        { label: "Shell",             command: "_Shell" },
        { label: "Cap",               command: "_Cap" },
        { label: "Extract Surface",   command: "_ExtractSrf" },
        { label: "Merge Faces",       command: "_MergeAllFaces" },
    ]},
    { label: "Modify — Mesh", tools: [
        { label: "Mesh from NURBS",   command: "_Mesh" },
        { label: "Weld Mesh",         command: "_Weld" },
        { label: "Unify Normals",     command: "_UnifyMeshNormals" },
        { label: "Reduce Mesh",       command: "_ReduceMesh" },
        { label: "Smooth",            command: "_Smooth" },
        { label: "QuadRemesh",        command: "_QuadRemesh" },
    ]},
    { label: "SubD", tools: [
        { label: "SubD Box",          command: "_SubDBox" },
        { label: "SubD Cylinder",     command: "_SubDCylinder" },
        { label: "SubD Sphere",       command: "_SubDSphere" },
        { label: "Crease Edge",       command: "_Crease" },
        { label: "Remove Crease",     command: "_RemoveCrease" },
        { label: "SubD to NURBS",     command: "_ToNURBS" },
        { label: "NURBS to SubD",     command: "_ToSubD" },
        { label: "Insert Edge",       command: "_InsertEdge" },
        { label: "Bridge",            command: "_Bridge" },
        { label: "Stitch",            command: "_Stitch" },
    ]},
    { label: "Analyze", tools: [
        { label: "Length",            command: "_Length" },
        { label: "Area",              command: "_Area" },
        { label: "Volume",            command: "_Volume" },
        { label: "Distance",          command: "_Distance" },
        { label: "Angle",             command: "_Angle" },
        { label: "Bounding Box",      command: "_BoundingBox" },
        { label: "Zebra",             command: "_Zebra" },
        { label: "Curvature",         command: "_CurvatureAnalysis" },
        { label: "Draft Angle",       command: "_DraftAngleAnalysis" },
        { label: "Environment Map",   command: "_EMap" },
        { label: "Check",             command: "_Check" },
        { label: "What",              command: "_What" },
    ]},
    { label: "Drafting", tools: [
        { label: "Dim Linear",        command: "_Dim" },
        { label: "Dim Aligned",       command: "_DimAligned" },
        { label: "Dim Angle",         command: "_DimAngle" },
        { label: "Dim Radius",        command: "_DimRadius" },
        { label: "Dim Diameter",      command: "_DimDiameter" },
        { label: "Leader",            command: "_Leader" },
        { label: "Hatch",             command: "_Hatch" },
        { label: "Clipping Plane",    command: "_ClippingPlane" },
    ]},
    { label: "View", tools: [
        { label: "Zoom Extents",      command: "_Zoom _All _Extents" },
        { label: "Zoom Selected",     command: "_Zoom _Selected" },
        { label: "4-View",            command: "_4View" },
        { label: "Max Viewport",      command: "_MaxViewport" },
        { label: "Named Views",       command: "_NamedView" },
        { label: "View Top",          command: "_SetView _World _Top" },
        { label: "View Front",        command: "_SetView _World _Front" },
        { label: "View Right",        command: "_SetView _World _Right" },
        { label: "View Persp",        command: "_SetView _World _Perspective" },
        { label: "View Bottom",       command: "_SetView _World _Bottom" },
        { label: "View Back",         command: "_SetView _World _Back" },
        { label: "View Left",         command: "_SetView _World _Left" },
    ]},
    { label: "Display", tools: [
        { label: "Wireframe",         command: "_SetDisplayMode _Mode=Wireframe" },
        { label: "Shaded",            command: "_SetDisplayMode _Mode=Shaded" },
        { label: "Rendered",          command: "_SetDisplayMode _Mode=Rendered" },
        { label: "Ghosted",           command: "_SetDisplayMode _Mode=Ghosted" },
        { label: "X-Ray",             command: "_SetDisplayMode _Mode=X-Ray" },
        { label: "Arctic",            command: "_SetDisplayMode _Mode=Arctic" },
        { label: "Technical",         command: "_SetDisplayMode _Mode=Technical" },
        { label: "Pen",               command: "_SetDisplayMode _Mode=Pen" },
        { label: "Hide Objects",      command: "_Hide" },
        { label: "Show Objects",      command: "_Show" },
        { label: "Lock Objects",      command: "_Lock" },
        { label: "Unlock All",        command: "_Unlock" },
    ]},
    { label: "Selection", tools: [
        { label: "Select All",        command: "_SelAll" },
        { label: "Deselect All",      command: "_SelNone" },
        { label: "Invert Sel.",       command: "_SelInvert" },
        { label: "Select Curves",     command: "_SelCrv" },
        { label: "Select Surfaces",   command: "_SelSrf" },
        { label: "Select Polysurfs",  command: "_SelPolysrf" },
        { label: "Select Meshes",     command: "_SelMesh" },
        { label: "Select SubD",       command: "_SelSubD" },
        { label: "Select by Layer",   command: "_SelLayer" },
        { label: "Select Dups",       command: "_SelDup" },
        { label: "Prev. Selection",   command: "_SelPrev" },
    ]},
    { label: "File", tools: [
        { label: "Save",              command: "_Save" },
        { label: "Save As",           command: "_SaveAs" },
        { label: "Import",            command: "_Import" },
        { label: "Export Selected",   command: "_Export" },
        { label: "Render",            command: "_Render" },
        { label: "Undo",              command: "_Undo" },
        { label: "Redo",              command: "_Redo" },
    ]},
];

// ─── V3 action builder helpers ────────────────────────────────────────────────

const idxToPos = i => `${i % COLS},${Math.floor(i / COLS)}`;

function stateStyle(title, image, size = 9, align = "bottom", color = "#ffffff") {
    return {
        FontFamily: "", FontSize: size, FontStyle: "", FontUnderline: false,
        Image: image,
        OutlineThickness: 2, ShowTitle: true,
        Title: title,
        TitleAlignment: align, TitleColor: color,
    };
}

function toolAction(tool, catLabel) {
    const actionID = randomUUID().toUpperCase();
    return {
        ActionID:    actionID,
        LinkedTitle: true,
        Name:        tool.label,
        Plugin:      { Name: "Rhino 3D Tools", UUID: "com.rhino3d.tools", Version: "1.0.0" },
        Resources:   null,
        Settings:    { category: catLabel, command: tool.command, label: tool.label },
        State:       0,
        States:      [stateStyle(tool.label, `Images/${actionID}.png`, 9, "bottom", "#ffffff")],
        UUID:        "com.rhino3d.tools.tool",
    };
}

function navAction(dir) {
    const isNext  = dir === "next";
    const actionID = randomUUID().toUpperCase();
    const title   = isNext ? "Next →" : "← Prev";
    return {
        ActionID:    actionID,
        LinkedTitle: true,
        Name:        title,
        Plugin:      { Name: "Pages", UUID: "com.elgato.streamdeck.page", Version: "1.0" },
        Resources:   null,
        Settings:    {},
        State:       0,
        States:      [stateStyle(title, null, 8, "middle", "#888888")],
        UUID:        isNext ? "com.elgato.streamdeck.page.next"
                            : "com.elgato.streamdeck.page.previous",
    };
}

// ─── Build pages ──────────────────────────────────────────────────────────────

const pages = [];

for (const cat of CATALOGUE) {
    const chunks = [];
    for (let i = 0; i < cat.tools.length; i += CMD_SLOTS) chunks.push(cat.tools.slice(i, i + CMD_SLOTS));
    chunks.forEach((chunk, ci) => {
        const suffix = chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : "";
        const short  = cat.label.includes(" — ") ? cat.label.split(" — ")[1] : cat.label;
        pages.push({ name: short + suffix, catLabel: cat.label, tools: chunk });
    });
}

// ─── Generate profile folder ──────────────────────────────────────────────────

const PROFILE_UUID = randomUUID().toUpperCase();
const profileRoot  = join(PROFILES_DIR, `${PROFILE_UUID}.sdProfile`);
const profilesDir  = join(profileRoot, "Profiles");

// Remove any old "Rhino 3D Tools" profile
try {
    for (const entry of readdirSync(PROFILES_DIR)) {
        const mPath = join(PROFILES_DIR, entry, "manifest.json");
        if (!existsSync(mPath)) continue;
        const m = JSON.parse(readFileSync(mPath, "utf8"));
        if (m.Name === "Rhino 3D Tools") rmSync(join(PROFILES_DIR, entry), { recursive: true, force: true });
    }
} catch { /* ignore */ }

mkdirSync(profilesDir, { recursive: true });

const pageUUIDs = pages.map(() => randomUUID().toUpperCase());
let iconHits = 0, iconMisses = 0;

pages.forEach((page, pi) => {
    const pageDir = join(profilesDir, pageUUIDs[pi]);
    mkdirSync(join(pageDir, "Images"), { recursive: true });

    const [r, g, b] = COLORS[page.catLabel] ?? [0x55, 0x55, 0x55];
    const actions = {};

    page.tools.forEach((tool, ti) => {
        let slot = ti;
        const pos0_2 = COLS * (ROWS - 1);      // 10 — bottom-left
        const pos4_2 = COLS * ROWS - 1;        // 14 — bottom-right
        if (slot >= pos0_2) slot++;
        if (slot >= pos4_2) slot++;
        const pos = idxToPos(slot);

        const iconRef = ICON_MAP[tool.command] ?? null;
        if (iconRef) iconHits++; else iconMisses++;

        const act = toolAction(tool, page.catLabel);
        const actionData = act;

        const icon = makeIcon(r, g, b, iconRef);
        writeFileSync(join(pageDir, "Images", `${act.ActionID}.png`), icon);

        actions[pos] = actionData;
    });

    // Nav buttons
    actions[`0,${ROWS - 1}`]         = navAction("prev");
    actions[`${COLS - 1},${ROWS - 1}`] = navAction("next");

    writeFileSync(join(pageDir, "manifest.json"), JSON.stringify({
        Controllers: [{ Actions: actions, Type: "Keypad" }],
        Icon: "",
        Name: page.name,
    }));
});

// Root manifest
writeFileSync(join(profileRoot, "manifest.json"), JSON.stringify({
    Device:  { Model: deviceModel, UUID: deviceUUID },
    Name:    "Rhino 3D Tools",
    Pages:   { Current: pageUUIDs[0], Default: pageUUIDs[0], Pages: pageUUIDs },
    Version: "3.0",
}));

// ─── Summary ──────────────────────────────────────────────────────────────────

const total = CATALOGUE.reduce((n, c) => n + c.tools.length, 0);
console.log(`\n✓  Profile installed to ProfilesV3`);
console.log(`   Device  : ${deviceModel}  (${deviceUUID || "auto-detect"})`);
console.log(`   Pages   : ${pages.length}`);
console.log(`   Buttons : ${total}  (${iconHits} with Rhino SVG icons, ${iconMisses} with colour-only)`);
console.log(`\n→  Fully quit Stream Deck (tray icon → Quit) then reopen it.`);
console.log(`   The "Rhino 3D Tools" profile will appear in the Profiles list.\n`);
