"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UploadButton } from "@/lib/uploadthing";
import { updateAvatar } from "@/app/(app)/settings/actions";

export function AvatarUpload({
  username,
  currentUrl,
}: {
  username: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(currentUrl);
  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        {url && <AvatarImage src={url} alt={username} />}
        <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <UploadButton
        endpoint="avatar"
        onClientUploadComplete={async (res) => {
          const uploaded = res[0];
          if (!uploaded) return;
          const result = await updateAvatar(uploaded.ufsUrl);
          if (result.ok) {
            setUrl(uploaded.ufsUrl);
            toast.success("Profilovka aktualizována");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        }}
        onUploadError={(err) => {
          toast.error(err.message);
        }}
      />
    </div>
  );
}
