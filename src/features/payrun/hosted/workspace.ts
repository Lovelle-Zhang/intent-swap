import { randomUUID } from "node:crypto";

import { openPostgresPayRunStorage } from "../adapters/storage/postgres/postgres-storage";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";

export interface VerifiedAuthIdentity { readonly userId: string; }
export interface PersonalWorkspaceView {
  readonly projectId: string;
  readonly name: string;
  readonly mode: "sandbox";
}

interface WorkspaceRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly mode: "sandbox";
}

export async function resolvePersonalWorkspace(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  createId: () => string = randomUUID,
): Promise<PersonalWorkspaceView> {
  return withHostedTransaction({ pool, userId: identity.userId }, async (client) => {
    const existing = await client.query<WorkspaceRow>(
      "SELECT id, name, mode FROM public.projects WHERE owner_user_id = $1::uuid",
      [identity.userId],
    );
    let row = existing.rows[0];
    if (!row) {
      await client.query(
        `INSERT INTO public.projects (id, owner_user_id, workspace_kind, name, mode)
         VALUES ($1::uuid, $2::uuid, 'personal', 'Personal Workspace', 'sandbox')
         ON CONFLICT (owner_user_id) DO NOTHING`,
        [createId(), identity.userId],
      );
      row = (await client.query<WorkspaceRow>(
        "SELECT id, name, mode FROM public.projects WHERE owner_user_id = $1::uuid",
        [identity.userId],
      )).rows[0];
    }
    if (!row) throw new Error("Personal Workspace could not be resolved");
    return { projectId: row.id, name: row.name, mode: row.mode };
  });
}

export async function openWorkspacePersistence(pool: SqlPool, identity: VerifiedAuthIdentity) {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  const persistence = await openPostgresPayRunStorage({
    pool,
    context: { userId: identity.userId, projectId: workspace.projectId },
  });
  return { workspace, persistence };
}
