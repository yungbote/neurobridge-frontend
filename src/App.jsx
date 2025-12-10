import React from "react";
import { BrowserRouter } from "react-router-dom";
import Layout from "@/layout/layout";
import { Button } from "@/components/ui/button";
import { AppRouter } from "@/router/AppRouter";
const App = () => {
  return (
    <BrowserRouter>
      <Layout>
        <div className="h-full flex justify-center">
          <main className="pt-8 md:pt-12 lg:pt-16">
            <AppRouter />
          </main>
        </div>
      </Layout>
    </BrowserRouter>
  )
}

export default App;










