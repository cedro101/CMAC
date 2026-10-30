import StorageCheck from "@/components/StorageCheck";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <StorageCheck />
    </div>
  );
}
