/**
 * Native Ads layout — minimal. Unlike Birds / Fly / Pet-Tag, Native Ads
 * doesn't need a workflow context (the flow is linear, useState in the
 * page component is enough).
 */

export default function NativeAdsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
