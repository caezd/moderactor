import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { terser } from "rollup-plugin-terser";

export default [
    {
        input: "src/index.js",
        output: [
            {
                file: "dist/moderaction.esm.js",
                format: "esm",
                sourcemap: true,
            },
            {
                file: "dist/moderaction.iife.js",
                format: "iife",
                name: "Moderaction",
                sourcemap: true,
            },
        ],
        plugins: [resolve(), commonjs(), terser()],
    },
];
