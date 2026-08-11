const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const jsFiles = ['js/data.js', 'js/security.js', 'js/supabase-config.js', 'js/app.js', 'js/admin.js'];
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));

for (const relativePath of jsFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    new vm.Script(source, { filename: relativePath });
}

for (const relativePath of htmlFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const blocks = [...source.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .filter((match) => !/type=["']application\/ld\+json["']/i.test(match[1] || ''))
        .map((match) => match[2])
        .filter((block) => block.trim());
    blocks.forEach((block, index) => new vm.Script(block, { filename: `${relativePath}:inline-${index + 1}` }));
}

console.log(`Parsed ${jsFiles.length} JavaScript files and ${htmlFiles.length} HTML files successfully.`);

