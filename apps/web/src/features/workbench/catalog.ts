import {
  ServiceType,
  validateJobInput,
  type FieldElement,
  type JobInput,
} from '@soul-society/sdk';

export type FormValues = {
  n: string;
  hash: string;
  preimage: string;
  root: string;
  leaf: string;
  proof: string;
  index: string;
};

export const EMPTY_FORM: FormValues = {
  n: '10',
  hash: '',
  preimage: '',
  root: '',
  leaf: '',
  proof: '',
  index: '0',
};

export const SERVICES = [
  {
    id: ServiceType.Fibonacci,
    index: '01',
    label: 'Fibonacci',
    eyebrow: 'public input',
    summary: 'Compute F(n), bind n and the result into a Cairo proof statement.',
  },
  {
    id: ServiceType.HashVerify,
    index: '02',
    label: 'Hash check',
    eyebrow: 'omitted from statement',
    summary:
      'Check a Poseidon preimage. The statement omits it, but this release makes no witness-hiding claim.',
  },
  {
    id: ServiceType.MerkleProof,
    index: '03',
    label: 'Merkle opening',
    eyebrow: 'omitted from statement',
    summary:
      'Check a Merkle path. The statement omits the path, but this release makes no witness-hiding claim.',
  },
] as const;

function parseInteger(value: string, label: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value.trim())) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is outside the safe integer range.`);
  }
  return parsed;
}

export function buildInput(service: ServiceType, form: FormValues): JobInput {
  let input: JobInput;
  switch (service) {
    case ServiceType.Fibonacci:
      input = { type: ServiceType.Fibonacci, n: parseInteger(form.n, 'n') };
      break;
    case ServiceType.HashVerify:
      input = {
        type: ServiceType.HashVerify,
        hash: form.hash.trim() as FieldElement,
        preimage: form.preimage.trim() as FieldElement,
      };
      break;
    case ServiceType.MerkleProof:
      input = {
        type: ServiceType.MerkleProof,
        root: form.root.trim() as FieldElement,
        leaf: form.leaf.trim() as FieldElement,
        proof: form.proof
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean) as FieldElement[],
        index: parseInteger(form.index, 'Leaf index'),
      };
      break;
  }
  return validateJobInput(input);
}
