import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AdminSidebar";
import { AdminAiChat } from "@/components/AdminAiChat";

export const Route = createFileRoute("/ai-chat")({
  head: () => ({
    meta: [
      { title: "AI Chat — IIT Kharagpur Helpdesk Admin" },
      {
        name: "description",
        content: "Test the campus helpdesk chatbot against its indexed documents.",
      },
    ],
  }),
  component: AiChatPage,
});

function AiChatPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        badge="AI Chat"
        title="Test the campus AI"
        sub="Try the student chatbot using the campus documents indexed by the helpdesk API."
      />
      <AdminAiChat />
    </div>
  );
}
