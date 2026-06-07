"use client";

interface Props {
  name: string;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Greeting({ name }: Props) {
  return (
    <h1 className="text-2xl font-bold text-gray-900">
      {getGreeting()}, {name}!
    </h1>
  );
}
