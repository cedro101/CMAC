"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import { ACTIVITY_LEVELS, getProfile, saveProfile, type ActivityLevel, type Profile } from "@/lib/profile";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none focus:border-accent";

function Form({ initial }: { initial: Profile | null }) {
  const [age, setAge] = useState(initial?.age.toString() ?? "");
  const [sex, setSex] = useState<Profile["sex"]>(initial?.sex ?? "male");
  const [height, setHeight] = useState(initial?.heightCm.toString() ?? "");
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? "moderate");
  const [about, setAbout] = useState(initial?.about ?? "");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ageValue = Number(age);
    const heightValue = Number(height);
    if (!Number.isFinite(ageValue) || ageValue < 13 || ageValue > 100) {
      setMessage({ text: "Enter your age in years.", error: true });
      return;
    }
    if (!Number.isFinite(heightValue) || heightValue < 100 || heightValue > 250) {
      setMessage({ text: "Enter your height in centimetres.", error: true });
      return;
    }
    await saveProfile({ age: ageValue, sex, heightCm: heightValue, activity, about: about.trim() });
    setMessage({ text: "Saved. The chat will use this from your next message.", error: false });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">About you</h2>
      <p className="mt-1 text-sm text-muted">
        The chat uses this for advice and your maintenance estimate. It&apos;s stored only on this phone, though the chat
        sends it to Claude with your messages.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Age
          <input inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Height (cm)
          <input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} className={FIELD_CLASS} />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-sm text-muted">
        Sex (used by the formula)
        <select value={sex} onChange={(event) => setSex(event.target.value as Profile["sex"])} className={FIELD_CLASS}>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm text-muted">
        Activity
        <select value={activity} onChange={(event) => setActivity(event.target.value as ActivityLevel)} className={FIELD_CLASS}>
          {Object.entries(ACTIVITY_LEVELS).map(([key, level]) => (
            <option key={key} value={key}>
              {level.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm text-muted">
        Anything else the chat should know
        <textarea
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          rows={5}
          placeholder="Your build, training, foods you eat often, places you eat out"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent"
        />
      </label>
      <button type="submit" className="mt-3 h-11 w-full rounded-xl bg-accent font-semibold text-black">
        Save
      </button>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export default function ProfileForm() {
  const profile = useLiveQuery(getProfile, []);
  if (profile === undefined) return null;
  return <Form initial={profile} />;
}
