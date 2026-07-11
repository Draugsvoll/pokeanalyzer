export type GrokImageContent = {
  type: "input_image";
  image_url: string;
};

export type GrokTextContent = {
  type: "input_text";
  text: string;
};

export type GrokMultimodalMessage = {
  role: "user";
  content: [GrokTextContent, GrokImageContent, ...GrokImageContent[]];
};
