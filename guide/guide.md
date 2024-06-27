# Guide: Deploying Contracts on Multiple Networks with Foundry and Interacting Using Sygma SDK

## Prerequisites

* Install [Foundry](https://github.com/foundry-rs/foundry)
* Node.js and npm installed on your machine
* Basic understanding of Solidity and Ethereum development

## Step 1: Deploying the contracts

### Install Foundry

Follow the instructions on the [Foundry GitHub page](https://github.com/foundry-rs/foundry#installation) to install Foundry.

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Add Foundry Binary Path to Your PATH

Ensure that the Foundry binary path (`~/.foundry/bin/`) is added to your PATH.

```bash
export PATH="$PATH:~/.foundry/bin/"
```

### Initialize a New Foundry Project

Create a new directory for your project and initialize it with Foundry.

```bash
mkdir foundry-multichain-deploy
cd foundry-multichain-deploy
forge init
```

### Install the Multi-Chain Deploy Tool

Install the `foundry-multichain-deploy` package.

```bash
forge install chainsafe/foundry-multichain-deploy
```

### Example Contract: `Counter.sol`

Foundry comes with a `Counter.sol` example. Create the contract in the `src` directory.

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Counter {
    uint256 public number;

    constructor(uint256 _number) {
        number = _number;
    }

    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }
}
```

### Deployment Script: `Counter.s.sol`

Create a deployment script in the `script` directory.

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {CrosschainDeployScript} from "foundry-multichain-deploy/CrosschainDeployScript.sol";

contract CounterScript is CrosschainDeployScript {
    function run() public {
        string memory artifact = "Counter.sol:Counter";
        this.setContract(artifact);
        bytes memory constructorArgs = abi.encode(uint256(10));
        bytes memory initData = abi.encodeWithSignature("setNumber(uint256)", uint256(104));
        this.addDeploymentTarget("sepolia", constructorArgs, initData);
        this.addDeploymentTarget("holesky", constructorArgs, initData);

        uint256 destinationGasLimit = 500000;
        uint256[] memory fees = this.getFees(destinationGasLimit, false);
        uint256 totalFee = this.getTotalFee(destinationGasLimit, false);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address[] memory contractAddresses =
            this.deploy{value: totalFee}(deployerPrivateKey, fees, destinationGasLimit, false);
        console.log("Sepolia contract address %s", contractAddresses[0]);
        console.log("Holesky contract address %s", contractAddresses[1]);
    }
}
```

### Running the Deployment Script

Run the script with the following command:

```bash
forge script script/Counter.s.sol:CounterScript --rpc-url $CHAIN_RPC_URL --broadcast
```

**Note:** The `CHAIN_RPC_URL` is the URL of the chain you would like to send the initial message of deployment. This will be relayed to other chains for deploying the contracts.

### Environment Variables

Ensure that the following environment variables are set:

* `PRIVATE_KEY`: Your private key for deployment.
* `CHAIN_RPC_URL`: The RPC URL of the chain to send the initial deployment message.

### Debugging

If you encounter any issues, you can add the `-vvvvv` flag to get the most detailed output from Foundry.

```bash
forge script script/Counter.s.sol:CounterScript --rpc-url $CHAIN_RPC_URL --broadcast -vvvvv
```

### Verifying Contracts

Refer to the Foundry book for details on how to verify contracts on explorers.

[Verify Contracts](https://book.getfoundry.sh/reference/forge/forge-verify-contract)

## Step 2: Interacting with Deployed Contracts Using Sygma SDK

### Prerequisites

* Node.js and npm installed on your machine
* Navigate to `evm-to-evm-generic-mesage-passing` to a different repository or to a folder in your same repo
* Install the dependencies through the following command:

```bash
yarn install
```
### Environment Variables

Create a `.env` file in the same directory and add the following content:

```plaintext
PRIVATE_KEY=your_private_key
BASE_SEPOLIA_RPC_URL=https://sepolia.drpc.org
HOLESKY_RPC_URL=https://holesky.drpc.org
```

Replace `your_private_key` with your actual private key.

### Setting Up the Node.js Script

Navigate to `/src` where you will find the file `transfer.ts` and `abi.ts`.
- `transfer.ts` is where you will find the server code using General Message Passing
- `abi.ts` is the ABI of the contract that we deployed earlier

During the deployment process, we set the initial value of the `Counter` contract to 104. This was done in the deployment script (`Counter.s.sol`) with the following line:

```solidity
bytes memory initData = abi.encodeWithSignature("setNumber(uint256)", uint256(104));
```

Now, we will demonstrate how to call the `increment` function of the deployed contract on one blockchain (Sepolia) from another blockchain (Holesky) using Sygma's general message passing.

### Function Signature

To get the function signature for `increment`, you can use the `cast` tool provided by Foundry:

```bash
cast sig "increment()"
```

The result will be the function signature, which we use in our script:

```javascript
const EXECUTE_FUNCTION_SIGNATURE = "0xd09de08a";
```

### Script overview

He is a full overview of the script and the code with explanations:

**Connecting to the Contract and Initializing Providers:**``

We use Ethers.Js under the hood to connect to the contract:

```javascript
const destinationProvider = new providers.JsonRpcProvider(HOLESKY_RPC_URL);
const sourceProvider = new providers.JsonRpcProvider(SEPOLIA_RPC_URL);
const counterContract = new ethers.Contract(EXECUTE_CONTRACT_ADDRESS, ABI, destinationProvider);
console.log("Connected to contract: ", counterContract.address);
const wallet = new Wallet(privateKey ?? "", sourceProvider);
```

**Fetching the Initial Contract Value:**

The goal is to get the value of `number` before we use the GMP and increment it

```javascript
const contractValueBefore = await counterContract.number();
console.log(`Value before update: ${contractValueBefore}`);
```

**Creating and Sending the Generic Message Transfer:**

```javascript
const messageTransfer = new EVMGenericMessageTransfer();
await messageTransfer.init(sourceProvider, Environment.TESTNET);

const transfer = messageTransfer.createGenericMessageTransfer(
  wallet.address,
  DESTINATION_CHAIN_ID,
  RESOURCE_ID,
  EXECUTE_CONTRACT_ADDRESS,
  EXECUTE_FUNCTION_SIGNATURE,
  EXECUTION_DATA,
  MAX_FEE
);

const fee = await messageTransfer.getFee(transfer);
console.log("Fee for the transfer: ", fee);

const transferTx = await messageTransfer.buildTransferTransaction(transfer, fee);
const response = await wallet.sendTransaction(transferTx as providers.TransactionRequest);
console.log("Sent transfer with hash: ", response.hash);
```

**Monitoring the Transfer Status and Fetching the Updated Value:**

```javascript
await waitUntilBridged(contractValueBefore);

const id = setInterval(() => {
  getStatus(response.hash)
    .then((data) => {
      if (data[0]) {
        console.log("Status of the transfer", data[0].status);
        if(data[0].status == "executed") {
          clearInterval(id);
          process.exit(0);
        }
      } else {
        console.log("Waiting for the TX to be indexed");
      }
    })
    .catch((e) => {
      console.log("error:", e);
    });
}, 5000);

const finalValue = await fetchAfterValue();
console.log("Final value: ", finalValue.toString());
```

### Running the Node.js Script

To run the script, use the following command:

```bash
yarn run transfer
```

### Expected Output

The script will output various messages indicating the progress of the transaction. It will show the initial value, the fee for the transfer, the transaction hash, and the status of the transfer. Once the transaction is successfully bridged, it will show the updated value. This should be the expected result of the script:

```bash
Connected to contract:  0x303e46f108ed47bf5a489cf62926fd3d8ddcc72a
Fetching contract value...
Sending a generic message transfer...
Value before update: 104
Sent transfer with hash:  0x251be7fcb2ee9f3041e15ca9871b22db78755af02936d08df566fd84b4765a8e
Waiting for relayers to bridge transaction...
Transaction successfully bridged.
Value after update: Thu Jan 01 1970 01:00:00 GMT+0100 (Western European Standard Time)
Final value:  105
Status of the transfer pending
...
Status of the transfer pending
Status of the transfer pending
Status of the transfer executed
```


### Debugging

If you encounter any issues, make sure to:

* Check the RPC URLs and private key in the `.env` file.
* Verify the contract addresses and function signatures.
* Ensure the ABI of the contract is correct and matches the deployed contract.
* Use the [Sygma scanner](https://scan.test.buildwithsygma.com/) in order to monitor your transactions

## Conclusion

This guide walked you through deploying a contract on multiple networks using Foundry and interacting with the deployed contracts using the Sygma SDK. You now have a setup to deploy and interact with smart contracts across different Ethereum testnets. Happy coding!