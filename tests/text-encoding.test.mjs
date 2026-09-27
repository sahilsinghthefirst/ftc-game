// A file re-saved in the wrong encoding turns dashes and dots into junk like
// "â€“" or "Â·", which then shows up on screen. Catch it before players do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const mojibake = /Ã|Â|â€|âˆ/;

test('no UI source file contains double-encoded characters', () => {
  const files = readdirSync('app').filter((name) =>
    /\.(ts|tsx|css)$/.test(name),
  );
  assert.ok(files.length > 0);
  for (const name of files) {
    const lines = readFileSync(`app/${name}`, 'utf8').split('\n');
    lines.forEach((line, index) =>
      assert.ok(
        !mojibake.test(line),
        `app/${name}:${index + 1} has garbled text: ${line.trim()}`,
      ),
    );
  }
});
