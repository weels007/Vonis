import ConnectButton from "./ConnectButton";
import { explorerAddress } from "../lib/genlayer";
import { formatGen, shortAddress } from "../lib/format";
import type { Route } from "../lib/router";

type Props = {
  routeName: Route["name"];
  networkLabel: string;
  configured: boolean;
  contractAddress: string;
  account: string;
  chainId: number | null;
  connecting: boolean;
  credit: number;
  balance: bigint;
  pendingWithdraw: boolean;
  pendingCount: number;
  onConnect: () => void;
  onSwitch: () => void;
  onWithdraw: () => void;
};

const navClass = (active: boolean) => "nav-link" + (active ? " active" : "");

export default function SiteHeader({
  routeName,
  networkLabel,
  configured,
  contractAddress,
  account,
  chainId,
  connecting,
  credit,
  balance,
  pendingWithdraw,
  pendingCount,
  onConnect,
  onSwitch,
  onWithdraw,
}: Props) {
  const casesActive = routeName === "cases" || routeName === "case";

  return (
    <header className="site-header">
      <a className="brand" href="#/" aria-label="Vonis home">
        <div className="mark">V</div>
        <div>
          <h1>Vonis</h1>
          <p>Dispute court for autonomous agents</p>
        </div>
      </a>

      <nav className="main-nav" aria-label="Main">
        <a className={navClass(casesActive)} href="#/cases">
          Cases
        </a>
        <a className={navClass(routeName === "new")} href="#/new">
          New case
        </a>
        <a className={navClass(routeName === "transactions")} href="#/transactions">
          Transactions{pendingCount > 0 ? " (" + pendingCount + ")" : ""}
        </a>
      </nav>

      <div className="header-tools">
        <span className="chip">{networkLabel}</span>
        {configured ? (
          <a
            className="chip"
            href={explorerAddress(contractAddress)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddress(contractAddress)}
          </a>
        ) : (
          <span className="chip warn">contract not set</span>
        )}
        {account && <span className="chip muted">{formatGen(Number(balance))}</span>}

        <ConnectButton
          account={account}
          chainId={chainId}
          connecting={connecting}
          onConnect={onConnect}
          onSwitch={onSwitch}
        />

        {credit > 0 && (
          <button
            className="btn primary"
            type="button"
            disabled={pendingWithdraw}
            onClick={onWithdraw}
          >
            {pendingWithdraw ? "Claiming…" : "Claim " + formatGen(credit)}
          </button>
        )}
      </div>
    </header>
  );
}
