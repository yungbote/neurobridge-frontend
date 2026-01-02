import React from "react";
import { BrowserRouter } from "react-router-dom";

import Layout from "@/app/layout/Layout";
import { AppRouter } from "@/app/router/AppRouter";

const App = () => {
  return (
    <BrowserRouter>
      <Layout>
        <AppRouter />
      </Layout>
    </BrowserRouter>
  );
};

export default App;









