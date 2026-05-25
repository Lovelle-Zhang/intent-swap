/**
 * Compile ConditionalSwapVault.sol → contracts/artifacts/ConditionalSwapVault.json
 *
 * Usage:
 *   node contracts/compile.js
 *
 * Emits an artifact with { abi, bytecode, contractName, compiler }.
 * deploy.js reads from that artifact, so this script must run successfully
 * before any deployment.
 */

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACT_NAME = "ConditionalSwapVault";
const SRC_PATH = path.join(__dirname, `${CONTRACT_NAME}.sol`);
const ARTIFACT_DIR = path.join(__dirname, "artifacts");
const ARTIFACT_PATH = path.join(ARTIFACT_DIR, `${CONTRACT_NAME}.json`);

const source = fs.readFileSync(SRC_PATH, "utf8");

const input = {
  language: "Solidity",
  sources: { [`${CONTRACT_NAME}.sol`]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

console.log(`Compiling ${CONTRACT_NAME}.sol with solc ${solc.version()}...`);

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  for (const e of output.errors) console.log(e.formattedMessage);
  if (fatal.length) {
    console.error(`\nCompilation failed with ${fatal.length} error(s)`);
    process.exit(1);
  }
}

const contractOutput = output.contracts[`${CONTRACT_NAME}.sol`][CONTRACT_NAME];
if (!contractOutput) {
  console.error(`No output for contract ${CONTRACT_NAME}`);
  process.exit(1);
}

const bytecode = "0x" + contractOutput.evm.bytecode.object;
if (bytecode === "0x") {
  console.error("Empty bytecode — abstract contract or missing implementation?");
  process.exit(1);
}

const artifact = {
  contractName: CONTRACT_NAME,
  compiler: solc.version(),
  abi: contractOutput.abi,
  bytecode,
};

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

console.log(`✅ ${path.relative(process.cwd(), ARTIFACT_PATH)}`);
console.log(`   bytecode: ${bytecode.length} chars (${(bytecode.length - 2) / 2} bytes)`);
console.log(`   abi: ${artifact.abi.length} entries`);
