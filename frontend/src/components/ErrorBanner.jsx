export default function ErrorBanner({ message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
      {message}
    </div>
  );
}
