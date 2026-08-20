import { questionHash } from './normalize';

/** Extra evidence needed to distinguish identical labels in repeated records. */
export interface AnswerContext {
  semanticPath?: string;
  optionSignature?: string;
}

/** Keep legacy, unscoped answers readable while separating repeated fields. */
export function answerKey(rawQuestion: string, context: AnswerContext = {}): string {
  const scope = `${context.semanticPath ?? ''}\u001f${context.optionSignature ?? ''}`;
  return scope === '\u001f' ? questionHash(rawQuestion) : questionHash(`${scope}\u001f${rawQuestion}`);
}
