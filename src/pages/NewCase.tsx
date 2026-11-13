import NewCaseForm from "../components/NewCaseForm";

type Props = {
  account: string;
  pending: boolean;
  onConnect: () => void;
  onCreate: (args: unknown[], value: bigint) => Promise<boolean>;
};

export default function NewCase({ account, pending, onConnect, onCreate }: Props) {
  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <span className="eyebrow">New case</span>
          <h1>Open a case</h1>
          <p>
            Escrow the reward, pin the specification and rubric, and name the provider agent. The
            rubric cannot be changed once the case exists.
          </p>
        </div>
      </div>

      <section className="panel narrow">
        <NewCaseForm
          inline
          account={account}
          pending={pending}
          onConnect={onConnect}
          onCreate={onCreate}
        />
      </section>
    </div>
  );
}
