// Genereert de Software Bill of Materials (CycloneDX) met de ingebouwde `npm sbom`.
// Gebruik: npm run sbom
//
//   sbom/app.cdx.json    wat wordt meegeleverd: de productiedependencies in de frontend-bundel
//                        (de server zelf heeft geen dependencies)
//   sbom/build.cdx.json  inclusief de buildtools (vite, tailwind, ...), voor supply-chain-analyse
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Via `npm run sbom` geeft npm zijn eigen pad mee; zo is geen shell nodig (ook niet op Windows).
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Start dit script met: npm run sbom');
  process.exit(1);
}

function sbom(extraArgs) {
  const out = execFileSync(process.execPath, [npmCli, 'sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'application', ...extraArgs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const bom = JSON.parse(out);
  // npm neemt de mapnaam als projectnaam; die verschilt per checkout. Gebruik de pakketnaam.
  bom.metadata.component.name = pkg.name;
  bom.metadata.component.licenses ??= [{ license: { id: pkg.license } }];
  return bom;
}

mkdirSync('sbom', { recursive: true });
const app = sbom(['--omit', 'dev']);
const build = sbom([]);
writeFileSync('sbom/app.cdx.json', `${JSON.stringify(app, null, 2)}\n`);
writeFileSync('sbom/build.cdx.json', `${JSON.stringify(build, null, 2)}\n`);
console.log(`CycloneDX ${app.specVersion}: sbom/app.cdx.json (${app.components.length} componenten), sbom/build.cdx.json (${build.components.length} componenten)`);
