import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCircle } from "lucide-react";
import type { UserProfile } from "../types";

export function ProfileSettings({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Profile</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage your public and private profile information.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Avatar</h3>
        <div className="flex items-center gap-6">
          <div className="size-20 rounded-full bg-muted flex items-center justify-center shrink-0 border">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                width={80}
                height={80}
                className="size-full rounded-full object-cover"
              />
            ) : (
              <UserCircle className="size-10 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm">Upload new</Button>
              <Button size="sm" variant="outline">Remove</Button>
            </div>
            <p className="text-xs text-muted-foreground">Recommended: Square image, at least 400x400px. JPG, PNG, or GIF.</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Personal Information</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Full Name</label>
            <Input defaultValue={profile.fullName} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">@</span>
              <Input defaultValue={profile.username} className="pl-7" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <Input type="email" defaultValue={profile.email} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number</label>
            <Input type="tel" defaultValue={profile.phoneNumber} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Biography</label>
            <Textarea defaultValue={profile.biography} rows={3} placeholder="A short bio about your trading style..." />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Region & Localization</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Country</label>
            <Select defaultValue="us">
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="uk">United Kingdom</SelectItem>
                <SelectItem value="ca">Canada</SelectItem>
                <SelectItem value="au">Australia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Timezone</label>
            <Select defaultValue="est">
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="est">America/New_York (EST)</SelectItem>
                <SelectItem value="utc">UTC</SelectItem>
                <SelectItem value="pst">America/Los_Angeles (PST)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline">Cancel</Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  );
}
