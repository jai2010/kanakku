import { extractDslFromUntrustedText } from '../../src/application/policies/extractDslText';

describe('extractDslFromUntrustedText', () => {
  it('returns trimmed plain DSL', () => {
    expect(extractDslFromUntrustedText('  POLICY "A"\nVERSION 1  ')).toBe('POLICY "A"\nVERSION 1');
  });

  it('extracts fenced DSL and ignores surrounding prose', () => {
    const text = `Sure, here you go:\n\`\`\`dsl\nPOLICY "A"\nVERSION 1\n\`\`\`\nGood luck.`;
    expect(extractDslFromUntrustedText(text)).toBe('POLICY "A"\nVERSION 1');
  });

  it('starts at the POLICY keyword when prose precedes it', () => {
    const text = 'Here is the policy:\nPOLICY "Meals"\nVERSION 1';
    expect(extractDslFromUntrustedText(text)).toBe('POLICY "Meals"\nVERSION 1');
  });
});
