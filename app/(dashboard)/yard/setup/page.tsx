import { YardSetupForm } from "@/components/yard/YardSetupForm";

export default function YardSetupPage() {
  return (
    <div className="container max-w-3xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-700">Set Up Your Yard</h1>
        <p className="text-gray-500 mt-1">
          Tell us about your lawn so we can give you personalized recommendations.
        </p>
      </div>
      <YardSetupForm />
    </div>
  );
}
