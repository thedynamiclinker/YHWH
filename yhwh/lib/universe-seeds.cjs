const marker = '# un root\n';
const hostOnly = 'OCI images and chroot sessions require the Linux YHWH host.';
const seeds = [
  { id: 'empty', label: 'Empty', description: 'An ordinary directory with a universe marker.' },
  { id: 'workshop', label: 'Lord workshop', description: 'A .@ command file, a TWO example, and a zan manual page. Works offline.' },
  { id: 'alpine', label: 'Alpine + lord', image: 'docker.io/library/alpine:latest', tools: 'lord' },
  { id: 'nix', label: 'Nix + lord', image: 'docker.io/nixos/nix:latest', tools: 'lord' },
  { id: 'gentoo', label: 'Gentoo + lord', image: 'docker.io/gentoo/stage3:latest', tools: 'lord' },
  { id: 'arch', label: 'Arch + lord', image: 'docker.io/library/archlinux:base', tools: 'lord' },
  { id: 'yhwh', label: 'Debian + lord + YHWH', image: 'docker.io/library/node:24-bookworm-slim', tools: 'yhwh' },
  { id: 'oci', label: 'Legacy provider · OCI image', description: 'Import a root filesystem from Docker Hub or another OCI registry.' },
];

function seedFor(id) {
  const seed = seeds.find(seed => seed.id === id);
  if (!seed) throw new Error('Unknown universe template. Choose a listed template.');
  return seed;
}

function universeName(name) {
  if (typeof name !== 'string' || !name.trim() || /[/\\\x00-\x1f\x7f]/.test(name) || name === '.' || name === '..')
    throw new Error('Enter one new directory name without slashes or control characters.');
  return name;
}

function seedFiles(id) {
  const seed = seedFor(id);
  if (seed.image || id === 'oci') throw new Error(hostOnly);
  if (id === 'workshop') return [
    ['TWO', 'show a greeting\nprintf "%s\\n" "hello from $PWD"\n'],
    ['zan/men/1/hello', 'hello — print a greeting\nRun `un hello` from the workshop. Use `un list` to see the .@ recipes.\n'],
    ['.@', marker + 'hello: printf "%s\\n" "hello from $PWD"\nmen: cat "$UN_SOURCE/zan/men/1/hello"\n'],
  ];
  return [['.@', marker]];
}

async function createSeed(root, id, { mkdir, write, remove }, join) {
  const files = seedFiles(id);
  await mkdir(root);
  try {
    const directories = new Set();
    for (const [file, content] of files) {
      let directory = root;
      for (const name of file.split('/').slice(0, -1)) {
        directory = join(directory, name);
        if (!directories.has(directory)) {
          await mkdir(directory);
          directories.add(directory);
        }
      }
      await write(join(root, file), content);
    }
  } catch (error) {
    await remove(root);
    throw error;
  }
  return root;
}

module.exports = { seeds, seedFor, marker, hostOnly, universeName, createSeed };
