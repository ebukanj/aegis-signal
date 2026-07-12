import { Loader } from "@/components/shared/loader";

/** Suspense fallback for workspace navigation. */
export default function PlatformLoading() {
  return <Loader label="Loading workspace" className="min-h-[60vh]" />;
}
