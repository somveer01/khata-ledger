const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist! Run expo export first.');
  process.exit(1);
}

// Copy all files from public/ into dist/
if (fs.existsSync(publicDir)) {
  const publicFiles = fs.readdirSync(publicDir);
  for (const file of publicFiles) {
    fs.copyFileSync(path.join(publicDir, file), path.join(distDir, file));
    console.log(`Copied public/${file} -> dist/${file}`);
  }
}

const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  const pwaTags = `    <link rel="manifest" href="/khata-ledger/manifest.json">
    <link rel="apple-touch-icon" href="/khata-ledger/icon-192.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Khata Book">
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/khata-ledger/sw.js').then(function(reg) {
            console.log('SW registered:', reg);
          }).catch(function(err) {
            console.log('SW registration failed:', err);
          });
        });
      }
    </script>`;

  if (!html.includes('manifest.json')) {
    html = html.replace('</head>', `${pwaTags}\n  </head>`);
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('Injected PWA tags into dist/index.html');
  }

  // Copy updated index.html to 404.html for GitHub Pages routing
  fs.writeFileSync(path.join(distDir, '404.html'), html, 'utf8');
  console.log('Created dist/404.html');
}

// Create .nojekyll so GitHub Pages does not ignore _expo directory
fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf8');
console.log('Created dist/.nojekyll');

console.log('dist successfully prepared for GitHub Pages & PWA installation!');
