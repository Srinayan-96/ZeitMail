"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
      <div className="text-2xl font-bold tracking-tight text-gray-900">ZeitMail</div>
      
      {session ? (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <Image 
                src={session.user.image} 
                alt="Avatar" 
                width={36} 
                height={36} 
                className="rounded-full"
              />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900">{session.user?.name}</span>
              <span className="text-xs text-gray-500">{session.user?.email}</span>
            </div>
          </div>
          <button 
            onClick={() => signOut()}
            className="text-sm text-gray-600 hover:text-gray-900 ml-4"
          >
            Logout
          </button>
        </div>
      ) : (
        <button 
          onClick={() => signIn('google')}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
        >
          Login with Google
        </button>
      )}
    </header>
  );
}
