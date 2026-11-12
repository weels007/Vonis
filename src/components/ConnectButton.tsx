import { CHAIN } from "../lib/wallet";
import { shortAddress } from "../lib/format";

type Props = {
  account: string;
  chainId: number | null;
  connecting: boolean;
  onConnect: () => void;
  onSwitch: () => void;
};

export default function ConnectButton({
  account,
  chainId,
  connecting,
  onConnect,
  onSwitch,
}: Props) {
  const wrongChain = !!account && chainId !== null && chainId !== CHAIN.id;

  return (
    <>
      {wrongChain && (
        <button className="btn warnBtn" type="button" onClick={onSwitch}>
          Switch to {CHAIN.name}
        </button>
      )}
      {account ? (
        <span className="chip success" title={account}>
          {shortAddress(account)}
        </span>
      ) : (
        <button className="btn" type="button" onClick={onConnect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}
    </>
  );
}
