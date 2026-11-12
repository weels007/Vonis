export type Criterion = {
  id: number;
  met: boolean;
  why: string;
};

export type CaseView = {
  id: string;
  title: string;
  status: string;
  verdict: string;
  award_bps: number;
  score: number;
  reasons: string;
  claim: string;
  criteria: Criterion[];
  reward: number;
  credit_provider: number;
  credit_requester: number;
  slashed: number;
  judged: boolean;
  judge_note: string;
  requester: string;
  provider: string;
  origin: string;
  delivery_deadline: number;
  dispute_deadline: number;
  appeal_deadline: number;
  submitted_ts: number;
  adjudicated_ts: number;
  settled_ts: number;
};
