const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'uptime.yml'),
    'utf8'
);

test('availability monitor authenticates the Supabase health request', () => {
    assert.match(workflow, /SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.SUPABASE_PUBLISHABLE_KEY \}\}/);
    assert.match(workflow, /--header "apikey: \$\{SUPABASE_PUBLISHABLE_KEY\}"/);
    assert.match(workflow, /if \[\[ -z "\$\{SUPABASE_PUBLISHABLE_KEY\}" \]\]/);
});

test('availability monitor covers public support pages without overlapping runs', () => {
    assert.match(workflow, /cron: '0 \* \* \* \*'/);
    assert.match(workflow, /group: production-availability/);
    assert.match(workflow, /cancel-in-progress: true/);
    assert.match(workflow, /\/safety\.html \/contact\.html/);
    assert.match(workflow, /--retry-all-errors/);
});
