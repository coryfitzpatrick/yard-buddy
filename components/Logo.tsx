import Image from "next/image";

const LOGO_SRC = "/ya-logo.webp";
const LOGO_INTRINSIC_WIDTH = 2690;
const LOGO_INTRINSIC_HEIGHT = 1749;

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-7 w-auto" }: LogoProps) {
  return (
    <Image
      src={LOGO_SRC}
      alt="Yard Analyzer"
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      className={className}
      sizes="48px"
      priority
    />
  );
}
