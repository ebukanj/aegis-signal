import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Plus } from "lucide-react";
import type { Role } from "../types";

export function RolesPermissions({ roles }: { roles: Role[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage RBAC policies and platform access levels.</p>
        </div>
        <Button className="gap-2">
          <Plus className="size-4" /> Create Role
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map(role => (
          <Card key={role.id} className="p-5 flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="size-5 text-primary" />
                <h3 className="font-semibold">{role.name}</h3>
              </div>
              <Badge variant="secondary" className="gap-1 font-normal">
                <Users className="size-3" /> {role.users.toLocaleString()}
              </Badge>
            </div>
            
            <div className="flex-1 space-y-2 mb-6">
              <p className="text-xs font-medium text-muted-foreground mb-2">Permissions Included:</p>
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.map(perm => (
                  <Badge key={perm} variant="outline" className="text-[10px] bg-muted/30">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t mt-auto">
              <Button variant="outline" size="sm" className="w-full">Edit Role</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
