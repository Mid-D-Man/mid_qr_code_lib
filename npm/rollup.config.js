import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',

  external: [],

  plugins: [
    typescript({
      tsconfig:       './tsconfig.json',
      declaration:    true,
      declarationDir: './dist',
      sourceMap:      true,
    }),
  ],

  output: [
    {
      file:                 'dist/index.js',
      format:               'es',
      sourcemap:            true,
      // inlineDynamicImports must be on the output object in rollup v4.
      // Required because generator.ts and scanner.ts use dynamic import()
      // for the WASM glue and nimiq worker — without this rollup tries to
      // code-split which requires output.dir instead of output.file.
      inlineDynamicImports: true,
    },
  ],
};
