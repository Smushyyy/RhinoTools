import {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    DidReceiveSettingsEvent
} from "@elgato/streamdeck";
import { sendCommandToRhino } from "../send-keys";

// -----------------------------------------------------------------------
// Tool catalogue
// -----------------------------------------------------------------------

export interface Tool     { label: string; command: string; }
export interface Category { label: string; tools: Tool[]; }

export const CATALOGUE: Category[] = [
    {
        label: "Draw — Curves",
        tools: [
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
            { label: "Text",              command: "_Text" },
        ]
    },
    {
        label: "Draw — Surfaces",
        tools: [
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
        ]
    },
    {
        label: "Draw — Solids",
        tools: [
            { label: "Box",               command: "_Box" },
            { label: "Sphere",            command: "_Sphere" },
            { label: "Cylinder",          command: "_Cylinder" },
            { label: "Cone",              command: "_Cone" },
            { label: "Truncated Cone",    command: "_TCone" },
            { label: "Torus",             command: "_Torus" },
            { label: "Pipe",              command: "_Pipe" },
        ]
    },
    {
        label: "Modify — Edit",
        tools: [
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
        ]
    },
    {
        label: "Modify — Transform",
        tools: [
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
        ]
    },
    {
        label: "Modify — Solids",
        tools: [
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
        ]
    },
    {
        label: "Modify — Mesh",
        tools: [
            { label: "Mesh from NURBS",   command: "_Mesh" },
            { label: "Weld Mesh",         command: "_Weld" },
            { label: "Unify Normals",     command: "_UnifyMeshNormals" },
            { label: "Reduce Mesh",       command: "_ReduceMesh" },
            { label: "Smooth",            command: "_Smooth" },
            { label: "QuadRemesh",        command: "_QuadRemesh" },
        ]
    },
    {
        label: "SubD",
        tools: [
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
        ]
    },
    {
        label: "Analyze",
        tools: [
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
        ]
    },
    {
        label: "Drafting",
        tools: [
            { label: "Dimension Linear",  command: "_Dim" },
            { label: "Dimension Aligned", command: "_DimAligned" },
            { label: "Dimension Angle",   command: "_DimAngle" },
            { label: "Dimension Radius",  command: "_DimRadius" },
            { label: "Dimension Diameter",command: "_DimDiameter" },
            { label: "Leader",            command: "_Leader" },
            { label: "Hatch",             command: "_Hatch" },
            { label: "Clipping Plane",    command: "_ClippingPlane" },
        ]
    },
    {
        label: "View",
        tools: [
            { label: "Zoom Extents",      command: "_Zoom _All _Extents" },
            { label: "Zoom Selected",     command: "_Zoom _Selected" },
            { label: "4-View Layout",     command: "_4View" },
            { label: "Max Viewport",      command: "_MaxViewport" },
            { label: "Named Views",       command: "_NamedView" },
            { label: "Set View — Top",    command: "_SetView _World _Top" },
            { label: "Set View — Front",  command: "_SetView _World _Front" },
            { label: "Set View — Right",  command: "_SetView _World _Right" },
            { label: "Set View — Persp",  command: "_SetView _World _Perspective" },
            { label: "Set View — Bottom", command: "_SetView _World _Bottom" },
            { label: "Set View — Back",   command: "_SetView _World _Back" },
            { label: "Set View — Left",   command: "_SetView _World _Left" },
        ]
    },
    {
        label: "Display",
        tools: [
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
        ]
    },
    {
        label: "Selection",
        tools: [
            { label: "Select All",        command: "_SelAll" },
            { label: "Deselect All",      command: "_SelNone" },
            { label: "Invert Selection",  command: "_SelInvert" },
            { label: "Select Curves",     command: "_SelCrv" },
            { label: "Select Surfaces",   command: "_SelSrf" },
            { label: "Select Polysurfs",  command: "_SelPolysrf" },
            { label: "Select Meshes",     command: "_SelMesh" },
            { label: "Select SubD",       command: "_SelSubD" },
            { label: "Select by Layer",   command: "_SelLayer" },
            { label: "Select Duplicates", command: "_SelDup" },
            { label: "Previous Selection",command: "_SelPrev" },
        ]
    },
    {
        label: "File",
        tools: [
            { label: "Save",              command: "_Save" },
            { label: "Save As",           command: "_SaveAs" },
            { label: "Import",            command: "_Import" },
            { label: "Export Selected",   command: "_Export" },
            { label: "Render",            command: "_Render" },
            { label: "Undo",              command: "_Undo" },
            { label: "Redo",              command: "_Redo" },
        ]
    },
];

// -----------------------------------------------------------------------
// Action
// -----------------------------------------------------------------------

interface Settings {
    category: string;
    command:  string;
    label:    string;
    [key: string]: string; // satisfies JsonObject — all fields are strings
}

@action({ UUID: "com.rhino3d.tools.tool" })
export class RhinoToolAction extends SingletonAction<Settings> {

    async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        const label = ev.payload.settings.label?.trim();
        if (label) await ev.action.setTitle(label);
    }

    async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        const label = ev.payload.settings.label?.trim();
        if (label) await ev.action.setTitle(label);
    }

    async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        const cmd = ev.payload.settings.command?.trim();
        if (!cmd) { await ev.action.showAlert(); return; }

        const ok = await sendCommandToRhino(cmd);
        if (!ok) await ev.action.showAlert();
    }
}
