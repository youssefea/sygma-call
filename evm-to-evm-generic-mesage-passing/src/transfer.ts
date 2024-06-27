import dotenv from "dotenv";
import {
  EVMGenericMessageTransfer,
  Environment,
  ExplorerUrl,
  TransferStatusResponse,
  getTransferStatusData,
} from "@buildwithsygma/sygma-sdk-core";
import { BigNumber, Wallet, providers, utils, ethers } from "ethers";
import {ABI} from "./abi";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error("Missing environment variable: PRIVATE_KEY");
}

const getStatus = async (
  txHash: string
): Promise<TransferStatusResponse[]> => {
    const data = await getTransferStatusData(Environment.TESTNET, txHash);
    return data as TransferStatusResponse[];
};

const DESTINATION_CHAIN_ID = 17000; // Holesky
const RESOURCE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000500"; // Generic Message Handler
const EXECUTE_CONTRACT_ADDRESS = "0x303e46f108ed47bf5a489cf62926fd3d8ddcc72a";
const EXECUTE_FUNCTION_SIGNATURE = "0xd09de08a";
const MAX_FEE = "3000000";
const SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.drpc.org"
const HOLESKY_RPC_URL = process.env.HOLESKY_RPC_URL || "https://holesky.drpc.org"

const destinationProvider= new providers.JsonRpcProvider(HOLESKY_RPC_URL);
const sourceProvider  = new providers.JsonRpcProvider(SEPOLIA_RPC_URL
);
const counterContract = new ethers.Contract( EXECUTE_CONTRACT_ADDRESS , ABI , destinationProvider )
console.log("Connected to contract: ", counterContract.address);
const wallet = new Wallet(privateKey ?? "", sourceProvider);

const fetchAfterValue = async (): Promise<BigNumber> =>
  await counterContract.number();

console.log("Fetching contract value...");

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const waitUntilBridged = async (
  valueBefore: BigNumber,
  intervalDuration: number = 15000,
  attempts: number = 8
): Promise<void> => {
  let i = 0;
  let contractValueAfter: BigNumber;
  for (;;) {
    await sleep(intervalDuration);
    contractValueAfter = await fetchAfterValue();
    if (!contractValueAfter.eq(valueBefore)) {
      console.log("Transaction successfully bridged.");
      console.log(
        `Value after update: ${new Date(
          contractValueAfter.toNumber()
        ).toString()}`
      );
      break;
    }
    i++;
    if (i > attempts) {
      // transaction should have been bridged already
      console.log("transaction is taking too much time to bridge!");
      break;
    }
  }
};

export async function genericMessage(): Promise<void> {
  console.log("Sending a generic message transfer...");
  const contractValueBefore = await counterContract.number();
  console.log(
    `Value before update: ${contractValueBefore}`
  );
  const messageTransfer = new EVMGenericMessageTransfer();
  await messageTransfer.init(sourceProvider, Environment.TESTNET);

  const EXECUTION_DATA = ""
  //console.log("Encoded data: ", EXECUTION_DATA);

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
  const transferTx = await messageTransfer.buildTransferTransaction(
    transfer,
    fee
  );

  const response = await wallet.sendTransaction(
    transferTx as providers.TransactionRequest
  );
  console.log("Sent transfer with hash: ", response.hash);

  console.log("Waiting for relayers to bridge transaction...");

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
}

genericMessage().finally(() => {});