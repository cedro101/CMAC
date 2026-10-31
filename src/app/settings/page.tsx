import AppSettings from "@/components/settings/AppSettings";
import BackupSection from "@/components/settings/BackupSection";
import GoalsForm from "@/components/settings/GoalsForm";
import HistoryImporter from "@/components/settings/HistoryImporter";
import SavedItems from "@/components/settings/SavedItems";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <GoalsForm />
      <BackupSection />
      <HistoryImporter />
      <SavedItems />
      <AppSettings />
    </div>
  );
}
