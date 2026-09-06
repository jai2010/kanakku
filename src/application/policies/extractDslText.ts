export function extractDslFromUntrustedText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const fence = trimmed.match(/```(?:sutra|dsl|text)?\s*\n?([\s\S]*?)```/i);
  const fenced = fence?.[1];
  if (fenced !== undefined) {
    return fenced.trim();
  }

  const policyIndex = trimmed.search(/^POLICY\b/m);
  if (policyIndex >= 0) {
    return trimmed.slice(policyIndex).trim();
  }

  return trimmed;
}
