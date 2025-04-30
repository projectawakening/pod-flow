# Pod Flow Overview

This repository provides a fully standalone mock environment for working with [Proof-of-Data (POD)](https://github.com/proofcarryingdata/zupass/tree/main/packages/lib/pod) and [General Purpose Circuits (GPC)](https://github.com/proofcarryingdata/zupass/tree/main/packages/lib/gpc) ([Documentation](https://pod.org/docs)). It includes the necessary tools and scripts to create PODs, manage GPC circuit parameters, compile circuits, generate proofs, and verify proofs off-chain. On-chain verification capabilities are planned for future integration.

The environment includes pre-generated mock POD data, allowing developers to experiment with the proof generation and verification workflow without needing external data sources initially. Circuit discovery (`find-circuit`) operates entirely on locally compiled artifacts.

# Pod Flow Project Setup

This guide outlines the steps required to set up the Pod Flow development environment.

## Prerequisites

*   **Node.js:** Version 18 is required (as specified in the root `package.json`). We recommend using [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) to manage Node.js versions.
*   **pnpm:** Version 8 or 9 is required. Install it globally via `npm install -g pnpm` if you don't have it. ([https://pnpm.io/installation](https://pnpm.io/installation))
*   **Rust & Cargo:** Required for compiling the Circom compiler. See the "Install Circom" section below if you don't have them installed.
*   **Git:** For cloning the repository.
*   **Memory:** While not a strict requirement for all operations, GPC circuit compilation (`compile-circuit`) and proof generation (`gen-proof`) can be memory-intensive. The scripts are configured to request up to **32GB of RAM** (16GB each for circuit compilation and proof generation) (`--max-old-space-size=32768`). Ensure your system has sufficient available memory for these steps, especially when working with complex proofs.

## Setup Steps

**1. Clone the Repository**

```bash
git clone https://github.com/projectawakening/pod-flow # Replace with your repo URL if different
cd pod-flow 
```

**2. Install Dependencies**

This project uses `pnpm` workspaces. Running `pnpm install` from the root directory will automatically:
*   Install all dependencies listed in the root `package.json`.
*   Install dependencies for each individual package located in the `packages/*` directories (e.g., `@pod-flow/client`, `@pod-flow/gpc`, etc.).
*   Link local packages together, so packages can import each other correctly (e.g., `@pod-flow/examples` can import from `@pod-flow/gpc`).
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

This project is configured via `packages/gpc/gpc-compile-config.json` to use `pot22` (supporting up to 2^22 constraints), which is suitable for the expected complexity of large GPC circuits.

Run the following command from the **root** of the project:

```bash
pnpm setup:gpc-ptau
```

This will execute the script in `packages/gpc/scripts/fetch-ptau.ts`, which reads the configuration and downloads the necessary file (e.g., `powersOfTau28_hez_final_22.ptau`) to the directory specified in `circomkit.json` (default: `packages/gpc/ptau/`).

*   **Note:** This is a large file (~4.5GB), so the download may take some time depending on your network connection. The script will show progress. If the file already exists, the script will skip the download. You can customize smaller version if you would like but we have opted to accomodate very large proofs.

*   You can find a complete list of other available `.ptau` files here: [https://github.com/iden3/snarkjs#7-powers-of-tau](https://github.com/iden3/snarkjs#7-powers-of-tau)

**5. Generate Authority Key (Optional)**

The project uses an EDDSA authority key and public key (`packages/contracts/.env`) which can be fetched and used via helper functions in `packages/pods/utils/fsUtils.ts`. 

**IMPORTANT**: to facilitate this we have left the `.env` files exposed to the github repo, be very careful with this behaviour. **NEVER** store or commit production keys to these files!

If you wish to generate your *own* authority key pair (e.g., for testing signing with a different identity), you can run the following script from the **root** directory (after deleting the existing keys from the `.env` file):

```bash
node scripts/generateAuthorityKey.js
```

*   **IMPORTANT:** If you generate a new set of keys, the pre-existing mock POD data in `packages/*/pod-data/` (which was signed with the *original* key) will **no longer verify successfully** if you try to validate their signatures against the *new* public key. You would need to re-generate the mock PODs using the scripts in `@pod-flow/pods` or `@pod-flow/examples` and sign them with your new key. Use the default key if you want to work with the provided mock data without modification.

## Package Overview

This project is a monorepo managed by `pnpm`. It consists of the following packages:

### `@pod-flow/examples`

*   **Description:** Contains various example implementations demonstrating how to use the Pod Flow GPC system. Each sub-directory typically focuses on a specific use case, providing necessary scripts, proof configurations, and parameter generation.
*   **Key Examples:**
    *   [`location-bounding`](./packages/examples/location-bounding/): Demonstrates proving proximity based on PODs representing ship and object locations, along with a distance assertion POD.
    *   [`inventory-verification`](./packages/examples/inventory-verification/): Demonstrates proving ownership of a specific item type from a pre-defined set, using inventory and item type PODs.
*   **Run Mock Flows:** Each example typically provides a `run-mock` script in the `examples` package's `package.json` (e.g., `location:run-mock`, `inventory:run-mock`) that orchestrates the necessary steps (parameter generation, proof generation) for that example.
    ```bash
    # Example: Run the full location bounding mock flow
    pnpm run location:run-mock

    # Example: Run the full inventory verification mock flow
    pnpm run inventory:run-mock
    ```

For example, the location command will:
*   Execute `location:gen-params` (script defined in `packages/examples/package.json`) to create/update `packages/examples/location-bounding/pod-data/location_proof_pods.json`.
*   Execute `location:gen-proof` (script defined in `packages/examples/package.json`), passing the default paths `./location-bounding/proof-configs/locationProofConfig.ts` and `./location-bounding/pod-data/location__porrof_pods.json` (relative to the `examples` package) as arguments.
*   The [`location:gen-proof`](./packages/examples/location-bounding/scripts/generateLocationProof.ts) script (`packages/examples/location-bounding/scripts/generateLocationProof.ts`) then orchestrates the full GPC workflow:
    *   Generates requirements (`gen-proof-requirements`).
    *   Generates structured proof inputs (`gen-proof-inputs`).
    *   Finds the best-fit existing circuit (`find-circuit`).
    *   *Optionally* compiles a new circuit if needed (`compile-circuit`).
    *   *Optionally* adds the new circuit to the known set (`add-circuit-params`).
    
    *   Generates the final proof (`gen-proof`).
    *   Copies the generated proof to `packages/examples/location-bounding/proof-output/`.
    *   Verifies the generated proof (`verify-proof`).

This provides a streamlined way to test the location proof use case from end-to-end.

---

### `@pod-flow/client`

*   **Description:** A boilerplate React front-end template designed for building User Interfaces (UI/UX) for MUD ([mud.dev](https://mud.dev)) decentralized applications. (Functionality TBD)
*   **Technology:** React, Vite, MUD client libraries (`@latticexyz/...`).
*   **Key Scripts:** `dev` (starts dev server), `build` (builds for production).

### `@pod-flow/contracts`

*   **Description:** Contains the on-chain smart contracts, primarily integrating with the MUD framework (EVE Frontier World V2 contracts coming soon). This package will eventually hold the Solidity verifier contract generated from our ZK circuits.
*   **Technology:** Solidity, MUD (`@latticexyz/world`, `@latticexyz/store`), Foundry (for testing/deployment via `forge` and `mud`).
*   **Key Scripts:** `build` (compiles contracts), `deploy:local` (deploys to local node), `test` (runs Forge tests).

### `@pod-flow/pods`

*   **Description:** Manages Proof-of-Data (POD) generation utilities and contains shared mock data. It includes scripts to fetch real-world game data (currently targeting the "Stillness" environment data via ESI-like APIs) and convert it into signed PODs.
*   **POD Data Format:** Shared mock POD data (e.g., `item_type_pods.json`) is typically stored as a JSON object where keys are the POD's `contentId` and values are the full `JSONPOD` objects (including entries and signature).
*   **Technology:** Node.js, TypeScript, `@pcd/pod` library ([GitHub](https://github.com/proofcarryingdata/zupass/tree/main/packages/lib/pod)), `dotenv` (for API keys if fetching data).
*   **Key Scripts:** Various `fetch-*` and `generate-*-pods` scripts. `initialize-game-data` and `update-game-data` orchestrate fetching. `generate-all-pods` creates PODs from fetched data.
*   **Note:** Re-fetching and generating new mock data, especially for all solar systems (~24,000) and their assemblies, can be **very time-consuming**. Using the provided mock data (located in `packages/*/pod-data/`) is recommended for initial development and **it is not necessary to run the data fetching scripts to use the core GPC proof generation workflow**.

#### Data Representation Notes

When converting raw game data into PODs, certain numeric values require special handling to be compatible with POD `int` types (which have `int64` limits) and to enable numeric comparisons within GPC circuits:

*   **Location Coordinates (x, y, z):**
    *   **Problem:** Raw location coordinates can be very large integers (represented as strings in the API) that exceed the `int64` range supported by the POD `int` type. Storing them as strings prevents numeric comparisons (bounds checks, inequalities) in GPC circuits.
    *   **Solution:** A **2-limb representation** is used. Each coordinate (x, y, or z) is split into a `_high` and `_low` part, each stored as a separate `int` entry in the POD (e.g., `location_x_high`, `location_x_low`). This effectively allows storing values up to 2^126 while remaining compatible with the `int64` circuit inputs. Helper functions for converting between `BigInt` and this 2-limb format exist in `packages/pods/utils/podBigInt.ts`.
    *   **Benefit:** Enables range checks and numeric comparisons on location coordinates within GPC proofs.

*   **Radius, Mass, and Volume:**
    *   **Problem:** These values can appear as integers or floating-point numbers in the source data. PODs do not have a native float type, and storing them as a mix of `int` and `string` prevents consistent numeric operations.
    *   **Solution:** **Fixed-point arithmetic** is used. All these values are multiplied by a fixed factor (currently 10^5, based on observing a maximum of 5 decimal places in the source data) and stored as integers (`int` type) in the POD. Helper functions for this conversion are available in `packages/pods/utils/podFixedPoint.ts`.
    *   **Benefit:** Allows all radius, mass, and volume values to be treated numerically within GPC circuits, enabling bounds checks and comparisons.

Essentially, these adjustments ensure that critical numeric data from the game can be represented and utilized effectively within the constraints and capabilities of the POD and GPC ecosystem.

### `@pod-flow/gpc`

*   **Description:** Handles the General Purpose Circuits (GPC) workflow ([GitHub](https://github.com/proofcarryingdata/zupass/tree/main/packages/lib/gpc)). This includes defining circuit parameters, managing circuit artifacts (like `.r1cs`, `.wasm`, `.zkey`), providing example proof configurations, and scripts for compiling circuits and generating inputs/proofs (located in [`packages/gpc/scripts/`](./packages/gpc/scripts/)). It's base family relies on the underlying circuit implementations from `@pcd/gpcircuits` ([GitHub](https://github.com/proofcarryingdata/zupass/tree/main/packages/lib/gpcircuits)).
*   **Technology:** Node.js, TypeScript, `@pcd/gpc`, `@pcd/gpcircuits`, `circom` (external compiler), `snarkjs`.
*   **Key Scripts:** `gen-proof-requirements`, `find-circuit`, `compile-circuit`, `add-circuit-params`, `gen-proof-inputs`, `gen-proof`, `verify-proof`, `setup:fetch-ptau`.

### GPC Workflow and Key Scripts

The core workflow for generating a proof for a specific use case involves several steps, primarily orchestrated by scripts within the `@pod-flow/gpc` package. Here's a typical sequence when running steps manually (commands assume execution from the workspace root):

**Intended Logic:** The general approach for handling circuits is:
1. Calculate the specific requirements for a given proof config and input set (`gen-proof-requirements`).
2. Search the existing, locally compiled circuits for the smallest one that meets these requirements (`find-circuit`).
3. If a suitable circuit is found, use its artifacts for proof generation.
4. If *no* suitable circuit is found:
    * Compile a new one based on the exact requirements (`compile-circuit`).
    * Add its parameters to the known set (`add-circuit-params`) to make it discoverable.
    * Use the new artifacts for proof generation.

**Manual Steps:**

1.  **Parameter Generation (`packages/examples/.../scripts/generate*Params.ts`)**:
    *   **Purpose:** Each example provides a script (e.g., `generateLocationParams.ts`, `generateInventoryParams.ts`) responsible for creating the necessary input PODs and structuring them into a standardized `params.json` file required by the GPC workflow.
    *   **`params.json` Structure:**
        *   `pods` (object): Contains the actual signed `JSONPOD` data for all PODs needed by the proof, keyed by their `contentId`.
        *   `podConfigMapping` (object): Maps the logical *config keys* used within the corresponding `GPCProofConfig` file (e.g., 'object', 'ship', 'inventory', 'keyItem1') to the actual `contentId` of the POD within the `pods` object. This allows GPC scripts to link the configuration constraints to the correct data.
        *   `membershipLists` (object, optional): Contains named lists of `PODValue`s or `PODValue[][]` (tuples) used for membership/non-membership constraints (`isMemberOf`, `isNotMemberOf`).
        *   `owner` / `watermark` (object/PODValue, optional): May contain identity information or a unique value, potentially including `PODValue`s.
    *   **Serialization:** These parameter generation scripts must serialize `PODValue` objects (especially those containing `BigInt`) into a JSON-compatible format before writing the `params.json` file using helpers like `podValueToJSON`. Conversely, GPC scripts reading this file must deserialize them back using `podValueFromJSON`.
    *   **Example:**
        ```bash
        # Run parameter generation for the location example
        pnpm run location:gen-params 
        # Output: packages/examples/location-bounding/pod-data/location_proof_params.json

        # Run parameter generation for the inventory example
        pnpm run inventory:gen-params
        # Output: packages/examples/inventory-verification/pod-data/inventory_proof_params.json
        ```

2.  **[`gen-proof-inputs`](./packages/gpc/scripts/gen-proof-inputs.ts)**:
    *   **Purpose:** Takes the high-level `params.json` file generated in the previous step and the corresponding `GPCProofConfig` file, verifies their consistency, deserializes the PODs and other values, and outputs a structured `_gpc_inputs.json` file containing live `POD` objects ready for the proving engine.
    *   **How it works:** Reads the config (`.ts`) and the parameters file (`params.json`). Uses the `podConfigMapping` to find and deserialize the correct PODs from the `pods` object. Deserializes `membershipLists`, `watermark`, etc. using `podValueFromJSON`. Verifies signatures and basic config/input consistency.
    *   **Output:** Creates a `_<configName>_gpc_inputs.json` file (e.g., `locationProofConfig_gpc_inputs.json`) in the `packages/gpc/proof-inputs/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof-inputs ./packages/examples/location-bounding/proof-configs/locationProofConfig.ts ./packages/examples/location-bounding/pod-data/location_proof_params.json
        ```

3.  **[`gen-proof-requirements`](./packages/gpc/scripts/gen-proof-requirements.ts)**:
    *   **Purpose:** Calculates the minimum circuit parameters required based on a `GPCProofConfig` (`.ts` file defining constraints) and the structured `_gpc_inputs.json` file generated previously.
    *   **How it works:** Analyzes the constraints in the config and the structure/content of the input PODs (from the `_gpc_inputs.json`) to determine the necessary `maxObjects`, `maxEntries`, `merkleMaxDepth`, etc. It performs detailed checks based on the `@pcd/gpc` library's logic.
    *   **Output:** Generates a `_<configName>_requirements.json` file (e.g., `locationProofConfig_requirements.json`) in the `packages/gpc/proof-requirements/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof-requirements ./packages/examples/location-bounding/proof-configs/locationProofConfig.ts ./packages/gpc/proof-inputs/locationProofConfig_gpc_inputs.json
        ```

4.  **[`find-circuit`](./packages/gpc/scripts/find-circuit.ts)**:
    *   **Purpose:** Checks if a pre-compiled circuit artifact exists locally that meets or exceeds the parameters specified in a `_requirements.json` file. It aims to find the smallest suitable circuit to minimize proving time.
    *   **How it works:** Compares the input requirements against the parameter sets listed in [`packages/gpc/src/circuitParameterSets.ts`](./packages/gpc/src/circuitParameterSets.ts) and checks for the existence of corresponding artifacts (`.wasm`, `-pkey.zkey`, `-vkey.json`) in the `packages/gpc/artifacts/` directory.
    *   **Output:** Prints the `circuitId` of the best matching circuit (e.g., `3o-26e-...`) or indicates that compilation is needed (`COMPILE_NEEDED <configName>`).
    *   **Example:**
        ```bash
        pnpm run find-circuit ./packages/gpc/proof-requirements/locationProofConfig_requirements.json
        ```

5.  **[`compile-circuit`](./packages/gpc/scripts/compile-circuit.ts) (Optional - if `find-circuit` indicates needed)**:
    *   **Purpose:** Compiles a new circuit based on a `_requirements.json` file and performs the necessary setup (`snarkjs`) to generate the proving and verification keys.
    *   **How it works:** Reads the requirements, loads configuration from `gpc-compile-config.json`, generates a canonical circuit name (ID), creates a temporary wrapper `.circom` file instantiating the base `proto-pod-gpc.circom` template with the specific parameters, compiles this wrapper using a direct `circom` command, performs the Groth16 Phase 2 trusted setup using the `snarkjs` programmatic API and the downloaded `.ptau` file, and finally moves the final artifacts (`.wasm`, `-pkey.zkey`, `-vkey.json`, and `.r1cs`) to the main `packages/gpc/artifacts/` directory. Cleans up temporary build files.
    *   **Example:**
        ```bash
        pnpm run compile-circuit ./packages/gpc/proof-requirements/locationProofConfig_requirements.json
        ```
    *   **Security Note:** The `snarkjs zkey contribute` step uses **dummy random entropy**. This means the setup is **not cryptographically secure** for production use. It's sufficient for testing and development, but a real deployment would require a proper multi-party computation (MPC) ceremony for the Phase 2 setup of each specific circuit.

6.  **[`add-circuit-params`](./packages/gpc/scripts/add-compiled-circuit-params.ts) (Optional - after compiling a *new* circuit)**:
    *   **Purpose:** Registers the parameters of a newly compiled circuit into the [`packages/gpc/src/circuitParameterSets.ts`](./packages/gpc/src/circuitParameterSets.ts) file. **This step is crucial** if you want the newly compiled circuit to be discoverable by `find-circuit` and usable by subsequent `gen-proof` calls.
    *   **How it works:** Reads the requirements file, derives the circuit ID, checks that the final artifacts exist in the `artifacts` directory, and then adds/updates the entry in the `supportedParameterSets` array in `circuitParameterSets.ts`.
    *   **Example:**
        ```bash
        pnpm run add-circuit-params ./packages/gpc/proof-requirements/locationProofConfig_requirements.json
        ```

7.  **[`gen-proof`](./packages/gpc/scripts/gen-proof.ts)**:
    *   **Purpose:** Generates the actual Zero-Knowledge proof based on a config and the structured inputs (`_gpc_inputs.json`).
    *   **How it works:** Takes the proof config (`.ts`) and the GPC inputs (`_gpc_inputs.json`), loads the requirements (`_requirements.json`), derives the circuit description and identifier, performs pre-computation (`gpcPreProve`), calls `snarkjs groth16 fullProve` using the circuit `.wasm` and `-pkey.zkey` artifacts, performs post-computation (`gpcPostProve`), and saves the resulting proof data (`proof` object, `boundConfig`, `revealedClaims`) to a JSON file.
    *   **Output:** Creates a `_<configName>_<circuitId>_proof.json` file (e.g., `locationProofConfig_3o-26e-..._proof.json`) in the `packages/gpc/proofs/` directory.
    *   **Example:**
        ```bash
        pnpm run gen-proof ./packages/examples/location-bounding/proof-configs/locationProofConfig.ts ./packages/gpc/proof-inputs/locationProofConfig_gpc_inputs.json
        ```

8.  **[`verify-proof`](./packages/gpc/scripts/verify-proof.ts)**:
    *   **Purpose:** Verifies a generated proof against the corresponding verification key.
    *   **How it works:** Loads the proof file (`_proof.json`), extracts the proof object, bound config, and revealed claims. It uses the `circuitIdentifier` from the bound config to find the matching circuit parameters in `circuitParameterSets.ts`, locates the corresponding verification key (`-vkey.json`) in the `artifacts` directory, and calls the `ProtoPODGPC.verify` function (which uses `snarkjs groth16 verify` internally).
    *   **Output:** Prints whether the proof is VALID or INVALID.
    *   **Example:**
        ```bash
        pnpm run verify-proof ./packages/gpc/proofs/locationProofConfig_3o-26e-6md-2nv-1ei-0x0l-0x0t-0ov3-0ov4_proof.json
        ```

**Important Disclaimers:**

*   **Mock Environment:** This repository provides a standalone development and testing environment. It is designed for mocking use cases and iterating quickly.
*   **No Trusted Setup:** The circuit compilation process (`compile-circuit`) includes a **dummy Phase 2 contribution**. This means the generated proving keys (`-pkey.zkey`) and verification keys (`-vkey.json`) are **not secure** for production environments where trust is required. A real deployment would necessitate a proper multi-party computation ceremony for each specific circuit compiled.
*   **Path Handling:** Scripts generally interpret file path arguments relative to the Current Working Directory (`process.cwd()`) from which `pnpm run` is executed (typically the workspace root). Ensure you provide paths correctly based on this convention.

---
