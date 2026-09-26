/** Mirrors the registrar's ASCII service-label rules; a full ENS name is not a label. */
export function serviceLabelError(label: string): string | null {
  if (!label) return "Enter a service name, for example weather.";
  if (label.includes("."))
    return "Enter only the service name, for example weather. Your workspace's ENS suffix is added automatically.";
  if (label.length < 3 || label.length > 32)
    return "Use 3 to 32 characters for the service name.";
  if (/^[\s]|[\s]$/.test(label))
    return "Remove spaces before or after the service name.";
  if (/[A-Z]/.test(label))
    return "Use lowercase letters, for example weather instead of Weather.";
  if (label.startsWith("-") || label.endsWith("-"))
    return "The service name must start and end with a letter or number.";
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(label))
    return "Use only lowercase letters (a-z), numbers and hyphens. Spaces and other symbols are not supported.";
  return null;
}
