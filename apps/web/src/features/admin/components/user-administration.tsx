"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { adminUsersApi } from "@/features/admin/api/users-api";
import { useAuthStore } from "@/features/auth/stores/auth-store";

/**
 * User administration — LIVE. Every row is a real account; suspend and delete hit
 * the real role-gated API. Suspension is the default action (history keeps its
 * author); deletion is behind a confirm and cannot touch your own account — the
 * backend refuses both self-suspension and self-deletion, so an admin can never
 * lock the last set of keys inside the house.
 */
export function UserAdministration() {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminUsersApi.list() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : "The action failed.");

  const suspend = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      adminUsersApi.setSuspended(id, suspended),
    onSuccess: (user) => {
      toast.success(`${user.email} ${user.suspended ? "suspended" : "reinstated"}.`);
      void refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminUsersApi.remove(id),
    onSuccess: () => {
      toast.success("Account deleted.");
      setConfirmingDelete(null);
      void refresh();
    },
    onError: fail,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every account on the platform. Suspension blocks sign-in and kills the
          session on its next check; deletion is permanent.
        </p>
      </div>

      {users.isPending ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Loading accounts…
        </div>
      ) : users.isError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-sm text-muted-foreground">
          Could not load users — this panel needs an ADMIN account.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-56 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data!.map((user) => {
                  const isSelf = user.id === me?.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "TRADER" ? "secondary" : "default"}
                          className="gap-1 text-[10px]"
                        >
                          {user.role !== "TRADER" && <ShieldCheck className="size-3" />}
                          {user.role}
                        </Badge>
                        {isSelf && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            you
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.suspended ? (
                          <Badge className="bg-destructive/15 text-destructive">Suspended</Badge>
                        ) : (
                          <Badge className="bg-success/15 text-success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isSelf && (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={suspend.isPending}
                              onClick={() =>
                                suspend.mutate({ id: user.id, suspended: !user.suspended })
                              }
                            >
                              {user.suspended ? (
                                <>
                                  <Undo2 className="size-3.5" /> Reinstate
                                </>
                              ) : (
                                <>
                                  <Ban className="size-3.5" /> Suspend
                                </>
                              )}
                            </Button>
                            {confirmingDelete === user.id ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(user.id)}
                              >
                                Confirm delete
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setConfirmingDelete(user.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
