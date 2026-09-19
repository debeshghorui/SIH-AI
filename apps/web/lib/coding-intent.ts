/** Mirror of apps/api/src/agent/code-files.ts looksLikeCodeRequest (web cannot import the API). */

const CODE_INTENT =
  /\b(html|css|javascript|\bjs\b|typescript|\bts\b|python|\bpy\b|code|script|web\s*page|web\s*site|sandbox|parselevels?)\b/i;
const CODE_VERB =
  /\b(write|writ|creates?|creat|generate|genrate|generete|genarate|generat\w*|build|make|fix|edit|modify|refactor|run|preview)\b/i;
const FILE_ASK =
  /\b((an?|the)\s+)?(html|css|javascript|js|typescript|ts|python|py)\s+files?\b/i;
const SCAFFOLD_ASK = /\b(react|npm|npx|vite|create-react-app|pip install)\b/i;
const PROJECT_FOLLOWUP =
  /\b((in|into|to)\s+(the\s+)?project|run\s+it|run\s+this|preview(\s+it)?|you have to run|need (it )?in (the )?project)\b/i;

export function looksLikeCodeRequest(query: string): boolean {
  if (SCAFFOLD_ASK.test(query)) return true;
  if (FILE_ASK.test(query)) return true;
  if (CODE_INTENT.test(query) && CODE_VERB.test(query)) return true;
  if (/\.(html|css|js|ts|py)\b/i.test(query) && CODE_VERB.test(query)) {
    return true;
  }
  return false;
}

export function wantsProjectStudio(
  query: string,
  preferModel?: string,
  extra?: { priorCoding?: boolean },
): boolean {
  if (preferModel === "coder") return true;
  if (looksLikeCodeRequest(query)) return true;
  if (extra?.priorCoding && PROJECT_FOLLOWUP.test(query)) return true;
  return false;
}
