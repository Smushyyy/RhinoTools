import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default defineConfig({
    input: "src/plugin.ts",
    output: {
        file: "com.rhino3d.tools.sdPlugin/bin/plugin.js",
        format: "esm",
        sourcemap: true
    },
    plugins: [
        typescript({ tsconfig: "./tsconfig.json" }),
        nodeResolve({ browser: false, preferBuiltins: true }),
        commonjs()
    ],
    external: [
        "stream", "net", "http", "https", "url", "path",
        "os", "fs", "events", "util", "buffer", "child_process"
    ]
});
