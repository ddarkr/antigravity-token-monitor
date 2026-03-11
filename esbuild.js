const esbuild = require('esbuild');
const esbuildSvelte = require('esbuild-svelte');

const watch = process.argv.includes('--watch');

async function run() {
  const extensionCtx = await esbuild.context({
    entryPoints: {
      extension: 'src/extension.ts'
    },
    bundle: true,
    outdir: 'dist',
    format: 'cjs',
    platform: 'node',
    target: ['node18'],
    sourcemap: true,
    external: ['vscode']
  });

  const webviewCtx = await esbuild.context({
    entryPoints: {
      'webview/main': 'src/webview/main.ts'
    },
    bundle: true,
    outdir: 'dist',
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    plugins: [
      esbuildSvelte({
        compilerOptions: { css: 'injected' }
      })
    ]
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    console.log('Watching antigravity-token-monitor...');
    return;
  }

  await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
  await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
