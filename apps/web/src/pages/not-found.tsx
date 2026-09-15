import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl font-bold text-muted-foreground">404</span>
      </div>
      <h1 className="text-lg font-bold text-foreground mb-2">الصفحة غير موجودة</h1>
      <p className="text-sm text-muted-foreground mb-6">الصفحة التي تبحث عنها غير موجودة</p>
      <Link
        href="/"
        className="flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Home className="w-4 h-4" />
        العودة للرئيسية
      </Link>
    </div>
  );
}
