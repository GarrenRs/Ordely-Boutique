import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageThumbProps {
  src?: string | null;
  alt?: string | null;
  className?: string;
  imageClassName?: string;
}

export default function ProductImageThumb({ src, alt, className, imageClassName }: ProductImageThumbProps) {
  return (
    <div className={cn("flex-shrink-0 overflow-hidden rounded-md border border-border bg-muted", className)}>
      {src ? (
        <img src={src} alt={alt ?? ""} className={cn("h-full w-full object-cover", imageClassName)} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
