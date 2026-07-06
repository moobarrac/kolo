import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { ConfirmProvider } from "@/components/Confirm";
import { Toaster } from "@/components/Toaster";
import App from "@/App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmProvider>
          <App />
          <Toaster />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
