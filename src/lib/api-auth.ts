import "server-only";
import { currentAdmin } from "./auth";

/** Route handlers return 401 instead of redirecting. */
export async function isAuthed() {
  return (await currentAdmin()) !== null;
}
