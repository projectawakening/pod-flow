# Pod Flow Overview

The repo is intended to be a fully standalone use case MOCK environment. It provided all of the tools and scripts necessary to create a set of PODs, and GPC circuits, to prove and verify POD data both off-chain and on-chain (coming soon), along with integration into teh EVE Frontier PAI endpoints, teh Frontier frontend dapp scaffold (coming soon), and the World V2 contracts (coming soon).
It includes pre-generated mock POD data, allowing developers to experiment with the proof generation and verification workflow without needing to set up external data fetching initially. Circuit discovery (`find-circuit`) operates entirely on locally compiled artifacts.

# Pod Flow Project Setup

This guide outlines the steps required to set up the Pod Flow development environment.

## Prerequisites

*   **Node.js:** Version 18 is required (as specified in the root `package.json`). We recommend using [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) to manage Node.js versions.
*   **pnpm:** Version 8 or 9 is required. Install it globally via `npm install -g pnpm` if you don't have it. ([https://pnpm.io/installation](https://pnpm.io/installation))
*   **Rust & Cargo:** Required for compiling the Circom compiler. See the "Install Circom" section below if you don't have them installed.
*   **Git:** For cloning the repository.

## Setup Steps

**1. Clone the Repository**

```bash
git clone https://github.com/projectawakening/pod-flow
cd pod-flow 
```

**2. Install Dependencies**

This project uses `pnpm` workspaces. Running `pnpm install` from the root directory will automatically:
*   Install all dependencies listed in the root `package.json`.
*   Install dependencies for each individual package located in the `packages/*` directories (e.g., `@pod-flow/client`, `@pod-flow/gpc`, etc.).
*   Link local packages together, so packages can import each other correctly (e.g., `@pod-flow/client` can import from `@pod-flow/contracts`).
*   Install `snarkjs`, which is needed for Zero-Knowledge proof operations, as a root dev dependency.

```bash
pnpm install
```

**3. Install Circom (Rust Version)**

This project requires the **Rust version** of the Circom compiler (v2.x.x or higher) for compiling Zero-Knowledge circuits.

*   **(a) Install Rust and Cargo (if needed):**
    Circom v2 is built with Rust. If you don't have Rust installed, the recommended way is via `rustup`:

    ```bash
    # Install rustup (follow on-screen prompts)
    curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh

    # Once installed, ensure cargo is in your PATH. 
    # You might need to restart your terminal or run:
    source "$HOME/.cargo/env" 

    # Verify installation
    rustc --version
    cargo --version 
    ```
    *(See the official Rust installation guide for more details: [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install))*

*   **(b) Clone and Build Circom:**
    Clone the official Circom repository and build the release version:

    ```bash
    # Clone the repository (can be outside your project)
    git clone https://github.com/iden3/circom.git

    # Navigate into the cloned directory
    cd circom

    # Build the release binary (this may take a few minutes)
    cargo build --release
    ```

*   **(c) Install Circom Binary:**
    Install the compiled binary into your user's Cargo bin directory:

    ```bash
    # Make sure you are still inside the cloned 'circom' directory
    cargo install --path circom 
    ```

*   **(d) Verify Installation and PATH:**
    Ensure your system uses the correct Rust version (`2.x.x`).

    ```bash
    # Clear the shell's command cache
    hash -r 

    # Check the version
    circom --version 
    ```
    *   **Expected Output:** `circom compiler 2.x.x` (e.g., `2.2.2`).
    *   **If you see `0.5.x`:** An older version is being found first in your PATH. Run `which circom` to find it. Either fix your PATH environment variable (in `~/.zshrc`, `~/.bash_profile`, etc.) to prioritize `$HOME/.cargo/bin`, or carefully remove the older version. Run `hash -r` and `circom --version` again after fixing.

**4. Fetch Powers of Tau File**

Zero-Knowledge proofs require a "Powers of Tau" (`.ptau`) file generated from a trusted setup ceremony. This file contains universal parameters needed for circuit compilation. Since these files are large, we fetch it using a script instead of committing it to Git.

This project is configured to use `pot22` (supporting up to 2^22 constraints), which is suitable for the expected complexity of GPC circuits upto an estimated 15 PODs in a single proof.

Run the following command from the **root** of the project:

```bash
pnpm setup:gpc-ptau
```

This will execute the script in `packages/gpc/scripts/fetch-ptau.ts`, which downloads the necessary file to `packages/gpc/ptau/powersOfTau28_hez_final_22.ptau`.

*   **Note:** This is a large file (~4.5GB), so the download may take some time depending on your network connection. The script will show progress. If the file already exists, the script will skip the download.

If you wanted to use a smaller version for your customizations you can find a complete list of .ptau files that could be used here:
https://github.com/iden3/snarkjs/blob/master/README.md

**5. Generate Authority Key (Optional)**

The project includes a default mock EDDSA authority key and public key (`packages/contracts/.env`) which can be fetched and used with the `packages/pods/utils/fsUtils.ts` file

If you wish to generate your *own* authority key pair (e.g., for testing signing with a different identity), you can run the following script from the **root** directory (after deleting the existing keys from the `.env` file):

```bash
node scripts/generateAuthorityKey.js
```

*   **IMPORTANT:** If you generate a new set of keys, the pre-existing mock POD data in `@pod-flow/pods/pod-data/` (which was signed with the *original* key) will **no longer verify successfully** if you try to validate their signatures against the *new* public key. You would need to re-generate the mock PODs using the scripts in `@pod-flow/pods` and sign them with your new key. Use the default key if you want to work with the provided mock data without modification.

## Package Overview

This project is a monorepo managed by `pnpm`. It consists of the following packages:

### Simplified Automated Workflow (`location-bounded-mock`)

The `@pod-flow/location-bounded-mock` package provides a high-level script (`run-location-bounded-mock`) that abstracts away most of the individual GPC steps for its specific use case (distance proofs) as an exmaple of how to integrate a specific use case with the mock environment.

To use this simplified flow:

1.  **(Prerequisite)** Ensure you have a valid GPC Proof Configuration file defining your distance proof constraints (e.g., `distanceProofConfig.ts`) located within the `packages/location-bounded-mock/proof-configs/` directory.
2.  **(Prerequisite)** Ensure you have generated the necessary input mock PODs. The `run-location-bounded-mock` script handles this, but it assumes the generated PODs (`location_pods.json`) are fresh enough to satisfy any timestamp constraints in your proof config. This script is included in the following script execution, so technically yo udon't need to run it seperately.
3.  Run the `run-location-bounded-mock` script from the **workspace root**: 
    ```bash
    pnpm --filter @pod-flow/location-bounded-mock run-location-bounded-mock
    ```

This command will:
*   Execute `generate-mock-pods` to create/update `packages/location-bounded-mock/pod-data/location_pods.json`.
*   Execute `generate-distance-proof`, passing the default paths `./proof-configs/distanceProofConfig.ts` and `./pod-data/location_pods.json` (relative to the `location-bounded-mock` package) as arguments.
*   The `generate-distance-proof` script then orchestrates the full GPC workflow:
    *   Generates requirements (`gen-proof-requirements`).
    *   Finds the best-fit existing circuit (`find-circuit`).
    *   *Optionally* compiles a new circuit if needed (`compile-circuit`).
    *   *Optionally* adds the new circuit to the known set (`add-circuit-params`).
    *   Generates the structured proof inputs (`gen-proof-inputs`).
    *   Generates the final proof (`gen-proof`).
    *   Copies the generated proof to `packages/location-bounded-mock/output/proof-data/`.
    *   Verifies the copied proof (`verify-proof`).

This provides a streamlined way to test the distance proof use case from end-to-end.

---

### `@pod-flow/client`

*   **Description:** A boilerplate React front-end template designed for building User Interfaces (UI/UX) for MUD ([mud.dev](https://mud.dev)) decentralized applications.
*   **Technology:** React, Vite, MUD client libraries (`@latticexyz/...`).
*   **Key Scripts:** `dev` (starts dev server), `build` (builds for production).

### `@pod-flow/contracts`

*   **Description:** Contains the on-chain smart contracts, primarily integrating with the MUD framework (EVE Frontier World V2 contracts coming soon). This package will eventually hold the Solidity verifier contract generated from our ZK circuits.
*   **Technology:** Solidity, MUD (`@latticexyz/world`, `@latticexyz/store`), Foundry (for testing/deployment via `forge` and `mud`).
*   **Key Scripts:** `build` (compiles contracts), `deploy:local` (deploys to local node), `test` (runs Forge tests).

### `@pod-flow/pods`

*   **Description:** Manages Proof-of-Data (POD) generation, utilities, and mock data storage. It contains scripts to fetch real-world game data (currently targeting the "Stillness" environment data via ESI-like APIs) and convert it into signed PODs. It also holds pre-generated mock PODs (signed with the default authority key).
*   **Technology:** Node.js, TypeScript, `@pcd/pod` library, `dotenv` (for API keys if fetching data).
*   **Key Scripts:** Various `fetch-*` and `generate-*-pods` scripts. `initialize-game-data` and `update-game-data` orchestrate fetching. `generate-all-pods` creates PODs from fetched data.
*   **Note:** Re-fetching and generating new mock data, especially for all solar systems (~24,000) and their assemblies, can be **very time-consuming**. Using the provided mock data (located in `packages/*/pod-data/`) is recommended for initial development and **it is not necessary to run the data fetching scripts to use the core GPC proof generation workflow**.

### Data Representation Notes

When converting raw game data into PODs, certain numeric values require special handling to be compatible with POD `int` types (which have `int64` limits) and to enable numeric comparisons within GPC circuits:

*   **Location Coordinates (x, y, z):**
    *   **Problem:** Raw location coordinates can be very large integers (represented as strings in the API) that exceed the `int64` range supported by the POD `int` type. Storing them as strings prevents numeric comparisons (bounds checks, inequalities) in GPC circuits.
    *   **Solution:** A **2-limb representation** is used. Each coordinate (x, y, or z) is split into a `_high` and `_low` part, each stored as a separate `int` entry in the POD (e.g., `location_x_high`, `location_x_low`). This effectively allows storing values up to 2^126 while remaining compatible with the `int64` circuit inputs.
    *   **Benefit:** Enables range checks and numeric comparisons on location coordinates within GPC proofs.
    *   **Note:** While this covers typical game coordinates, representing extremely large numbers like full `uint256` values would require more limbs (e.g., 5). Helper functions for converting between `BigInt` and this 2-limb format exist in `packages/pods/utils/`.

*   **Radius, Mass, and Volume:**
    *   **Problem:** These values can appear as integers or floating-point numbers in the source data. PODs do not have a native float type, and storing them as a mix of `int` and `string` prevents consistent numeric operations.
    *   **Solution:** **Fixed-point arithmetic** is used. All these values are multiplied by a fixed factor (currently 10^5, based on observing a maximum of 5 decimal places in the source data) and stored as integers (`int` type) in the POD.
    *   **Benefit:** Allows all radius, mass, and volume values to be treated numerically within GPC circuits, enabling bounds checks and comparisons.
    *   **Note:** Helper functions for converting between floating-point numbers and this fixed-point `BigInt` representation are available in `packages/pods/utils/`.

Essentially, these adjustments ensure that critical numeric data from the game can be represented and utilized effectively within the constraints and capabilities of the POD and GPC ecosystem.

### `@pod-flow/gpc`

*   **Description:** Handles the Generic Proof Carrying (GPC) circuit workflow. This includes defining circuit parameters, managing circuit artifacts (like `.r1cs`, `.wasm`, `.zkey`), providing example proof configurations, and scripts for compiling circuits and generating inputs for proof generation.
*   **Technology:** Node.js, TypeScript, `@pcd/gpc`, `circom` (external compiler), `snarkjs`.
*   **Key Scripts:** `generate-requirements`, `generate-inputs`, `generate-circuit-inputs`, `find-circuit`, `compile-circuit`, `setup:fetch-ptau`.

### GPC Workflow and Key Scripts

The core workflow for generating a proof for a specific use case involves several steps, orchestrated by scripts within this package. Here's a typical sequence, assuming commands are run from the workspace root using `pnpm run ...`:

**Intended Logic:** The general approach for handling circuits is:
1. Calculate the specific requirements for a given proof config and input set.
2. Search the existing, locally compiled circuits (`find-circuit`) for the smallest one that meets these requirements.
3. If a suitable circuit is found, use its artifacts for proof generation.
4. If *no* suitable circuit is found, compile a new one based on the exact requirements (`compile-circuit`), add its parameters to the known set (`add-circuit-params`), and then use the new artifacts.

**Manual Steps:**

1.  **`gen-proof-requirements`**:
    *   **Purpose:** Calculates the minimum circuit parameters required based on a GPC proof configuration (`.ts` file defining constraints) and a sample set of input PODs (`.json` file).
    *   **How it works:** Analyzes the constraints in the config and the structure/content of the input PODs to determine the necessary `maxObjects`, `maxEntries`, `merkleMaxDepth`, etc.
    *   **Output:** Generates a `_requirements.json` file (e.g., `simpleConfig_requirements.json`) in the `packages/gpc/proof-requirements/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof-requirements ./packages/gpc/proof-configs/simpleConfig.ts ./packages/location-bounded-mock/pod-data/ship_pod.json
        ```

2.  **`find-circuit`**:
    *   **Purpose:** Checks if a pre-compiled circuit artifact exists locally that meets or exceeds the parameters specified in a `_requirements.json` file. It aims to find the smallest suitable circuit to minimize proving time.
    *   **How it works:** Compares the input requirements against the parameter sets listed in `packages/gpc/src/circuitParameterSets.ts` and checks for the existence of corresponding artifacts (`.wasm`, `-pkey.zkey`, `-vkey.json`) in the `packages/gpc/artifacts/` directory.
    *   **Output:** Prints the path to the best matching circuit's artifacts or indicates that compilation is needed (`COMPILE_NEEDED <configName>`).
    *   **Example:**
        ```bash
        pnpm run find-circuit ./packages/gpc/proof-requirements/simpleConfig_requirements.json
        ```

3.  **`compile-circuit` (Optional - if `find-circuit` indicates needed)**:
    *   **Purpose:** Compiles a new circuit based on a requirements file and performs the necessary setup (`snarkjs`) to generate the proving and verification keys.
    *   **How it works:** Reads the requirements, generates a canonical circuit name based on these parameters (e.g., `1o-11e-...`), creates a temporary wrapper `.circom` file that includes the base `proto-pod-gpc.circom` template and instantiates it with the loaded parameters, compiles this wrapper file using `circomkit compile` to generate intermediate files (R1CS, WASM witness generator components, etc.) in the `build/circomkit/<circuitName>/` directory, performs the Groth16 Phase 2 trusted setup using `snarkjs` commands (`setup`, `contribute` (dummy), `export verificationkey`) and the downloaded `.ptau` file (intermediate keys also placed in the build directory), and finally moves the final artifacts (`.wasm`, `circuit_final.zkey` renamed to `-pkey.zkey`, `verification_key.json` renamed to `-vkey.json`) from the build directory to the main `packages/gpc/artifacts/` directory.
    *   **Example:**
        ```bash
        pnpm run compile-circuit ./packages/gpc/proof-requirements/simpleConfig_requirements.json
        ```
    *   **Security Note:** The `snarkjs zkey contribute` step in this script uses a **dummy contribution**. This means the setup is **not cryptographically secure** for production use. It's sufficient for testing and development within this mock environment, but a real deployment would require a proper multi-party computation (MPC) ceremony for the Phase 2 setup of each specific circuit.
    *   **Important:** The intermediate build directory (`build/circomkit/<circuitName>/`) is **not** automatically cleaned up by this script.

4.  **`add-circuit-params` (Optional - after compiling a *new* circuit)**:
    *   **Purpose:** Registers the parameters of a newly compiled circuit into the `packages/gpc/src/circuitParameterSets.ts` file. **This step is crucial** if you want the newly compiled circuit to be discoverable by `find-circuit` and usable by subsequent `gen-proof` calls for matching requirements.
    *   **How it works:** Reads the requirements file, derives the circuit ID, checks that the final artifacts exist in the `artifacts` directory, and then adds/updates the entry in the `supportedParameterSets` array in `circuitParameterSets.ts`.
    *   **Example:**
        ```bash
        pnpm run add-circuit-params ./packages/gpc/proof-requirements/simpleConfig_requirements.json
        ```

5.  **`gen-proof-inputs`**:
    *   **Purpose:** Generates the structured input `.json` file required by the `gen-proof` script.
    *   **How it works:** Takes a proof configuration file (`.ts`) and a corresponding set of input PODs (`.json` array), verifies the PODs match the config keys, and structures them into the `GPCProofInputs` format (including the `pods` record).
    *   **Output:** Creates a `_gpc_inputs.json` file (e.g., `simpleConfig_gpc_inputs.json`) in the `packages/gpc/proof-inputs/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof-inputs ./packages/gpc/proof-configs/simpleConfig.ts ./packages/location-bounded-mock/pod-data/ship_pod.json
        ```

6.  **`gen-proof`**:
    *   **Purpose:** Generates the actual Zero-Knowledge proof based on a config and structured inputs.
    *   **How it works:** Takes the proof config (`.ts`) and the structured GPC inputs (`_gpc_inputs.json`), determines the correct circuit artifacts (using logic similar to `find-circuit` based on requirements derived from the config/inputs), performs pre-computation (`gpcPreProve`), calls `snarkjs groth16 fullProve` using the circuit `.wasm` and `-pkey.zkey`, performs post-computation (`gpcPostProve`), and saves the resulting proof data (`proof` object, `boundConfig`, `revealedClaims`).
    *   **Output:** Creates a `_<circuitId>_proof.json` file (e.g., `simpleConfig_1o-11e..._proof.json`) in the `packages/gpc/proofs/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof ./packages/gpc/proof-configs/simpleConfig.ts ./packages/gpc/proof-inputs/simpleConfig_gpc_inputs.json
        ```

7.  **`verify-proof`**:
    *   **Purpose:** Verifies a generated proof against the corresponding verification key.
    *   **How it works:** Loads the proof file (`_proof.json`), extracts the proof object, bound config, and revealed claims. It uses the `circuitIdentifier` from the bound config to find the matching circuit parameters in `circuitParameterSets.ts`, locates the corresponding verification key (`-vkey.json`) in the `artifacts` directory, and calls the `gpcVerify` function (which uses `snarkjs groth16 verify`).
    *   **Output:** Prints whether the proof is VALID or INVALID.
    *   **Example:**
        ```bash
        pnpm run verify-proof ./packages/gpc/proofs/simpleConfig_1o-11e-5md-0nv-0ei-0x0l-0x0t-0ov3-0ov4_proof.json
        ```

**Important Disclaimers:**

*   **Mock Environment:** This repository provides a standalone development and testing environment. It is designed for mocking use cases and iterating quickly.
*   **No Trusted Setup:** The circuit compilation process (`compile-circuit`) includes a **dummy Phase 2 contribution**. This means the generated proving keys (`-pkey.zkey`) and verification keys (`-vkey.json`) are **not secure** for production environments where trust is required. A real deployment would necessitate a proper multi-party computation ceremony for each specific circuit compiled.
*   **Path Handling:** The scripts have been updated to interpret file path arguments relative to the Current Working Directory (`process.cwd()`) from which `pnpm run` is executed (typically the workspace root). Ensure you provide paths correctly based on this convention.

**(Renamed) Compiling GPC Circuits Manually (If Needed)**

The `@pod-flow/gpc` package comes with a pre-compiled circuit (`1o-11e-...`) defined in `packages/gpc/scripts/circuitParameterSets.ts`. You typically only need to compile a new circuit manually if the existing circuits don't meet the parameters calculated by `gen-proof-requirements` for your specific use case (as indicated by the `find-circuit` script).

If you need to compile a circuit variant based on a generated requirements file:

1.  Ensure the requirements file (e.g., `myConfig_requirements.json`) exists in `packages/gpc/proof-requirements/`.
2.  Run the compilation script from the **workspace root**, passing the **path to the requirements file**:
    ```bash
    # Example: Compile a circuit based on simpleConfig requirements
    pnpm run compile-circuit ./packages/gpc/proof-requirements/simpleConfig_requirements.json
    ```
    **(Remember to run `pnpm run add-circuit-params ...` afterwards if you want this new circuit to be used automatically by `gen-proof`)**

*   **Process:** This script automates the following:
    *   Reads the parameters from the specified `_requirements.json` file.
    *   Generates a canonical circuit name based on these parameters (e.g., `1o-11e-...`).
    *   Creates a temporary wrapper `.circom` file that includes the base `proto-pod-gpc.circom` template and instantiates it with the loaded parameters.
    *   Compiles this wrapper file using `circomkit compile` to generate intermediate files (R1CS, WASM witness generator components, etc.) in the `build/circomkit/<circuitName>/` directory.
    *   Performs the Groth16 Phase 2 trusted setup using `snarkjs` commands (`setup`, `contribute` (dummy), `export verificationkey`) and the downloaded `.ptau` file. These intermediate keys (`circuit_0000.zkey`, `circuit_final.zkey`, `verification_key.json`) are also placed in the `build/circomkit/<circuitName>/` directory.
    *   Moves the final artifacts (`.wasm`, `circuit_final.zkey`, `verification_key.json`) from the build directory to the main `packages/gpc/artifacts/` directory, renaming the `.zkey` to `-pkey.zkey` and the `.wasm`/`.json` files according to the convention `<familyName>_<circuitName>.{wasm, -vkey.json}`.
    *   **Important:** The intermediate build directory (`build/circomkit/<circuitName>/`) is **not** automatically cleaned up by this script.
*   **Curve Note:** The compilation script uses the `bn128` (also known as `bn254`) curve prime field, compatible with the standard `pot22` `.ptau` file.
*   **Memory:** Circuit compilation, especially the `snarkjs` setup steps, can be memory-intensive (requires ~16GB RAM). Adjust `NODE_OPTIONS=--max-old-space-size=XXXX` in `packages/gpc/scripts/compile-circuit.ts` if needed.
*   **Output:** Successful compilation places the final deployable artifacts (`<familyName>_<circuitName>.wasm`, `<familyName>_<circuitName>-pkey.zkey`, `<familyName>_<circuitName>-vkey.json`) directly into the `packages/gpc/artifacts/` directory.

---

### `@pod-flow/location-bounded-mock`

*   **Description:** Provides a concrete example use case demonstrating how to leverage the other packages to implement a specific proof scenario (location bounding based on distance). It generates specific mock PODs for this scenario and generates the corresponding GPC proof.
*   **Technology:** Node.js, TypeScript, leverages `@pod-flow/pods`, `@pod-flow/gpc`.
*   **Key Scripts:** `generate-mock-pods`, `generate-distance-proof`, `run-location-bounded-mock`.
*   **Note:** New use cases modeled here are guaranteed to support off-chain proof generation. On-chain verification depends on whether the use case's requirements fit within one of the pre-compiled general circuits (or if a specific verifier is generated and deployed). Future work may include utilities to check circuit compatibility.

---
