import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',

  // inlineDynamicImports bundles dynamic import() calls into the single
  // output file instead of splitting them into chunks.
  // Required because generator.ts and scanner.ts use dynamic imports for
  // the WASM module and the nimiq worker respectively.
  // For a library this is the correct behaviour — consumers get one JS file
  // and manage the WASM binary path themselves via MidQr.create(wasmUrl).
  inlineDynamicImports: true,

  output: [
    {
      file:      'dist/index.js',
      format:    'es',
      sourcemap: true,
    },
  ],

  plugins: [
    typescript({
      tsconfig:        './tsconfig.json',
      declaration:     true,
      declarationDir:  './dist',
      sourceMap:       true,
    }),
  ],

  // Tell rollup these are external — consumers provide them at runtime.
  // The WASM glue file is loaded dynamically via ensureWasm() at runtime,
  // not bundled. The nimiq worker is resolved by the browser/node at runtime.
  external: [],
};
