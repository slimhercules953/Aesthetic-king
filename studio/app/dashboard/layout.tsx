import {
    cookies,
} from "next/headers";

import {
    redirect,
} from "next/navigation";

import Sidebar from "../../components/dashboard/Sidebar";
import Topbar from "../../components/dashboard/Topbar";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../lib/session";

import {
    awardForDailyVisit,
} from "../../lib/crownEarning";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        redirect("/");
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        redirect("/");
    }

    /*
     * The daily visit is awarded here because this layout is the single
     * place every signed-in page passes through. It is a duplicate lookup
     * on all but the first visit of the day, so it costs one indexed read
     * rather than a write.
     */
    await awardForDailyVisit(session.discordId);

    return (
        <div className="h-screen overflow-hidden bg-[#08080c] text-white">
            <div className="flex h-full">
                <Sidebar
                    username={
                        session.username
                    }
                />

                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <Topbar
                        username={
                            session.username
                        }
                    />

                    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-6 lg:px-8 lg:py-8">
                        <div className="mx-auto max-w-[1500px]">
                            {
                                children
                            }
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}