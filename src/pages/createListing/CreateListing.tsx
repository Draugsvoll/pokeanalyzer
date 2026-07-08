import { useState } from "react";
import "./CreateListing.scss";
import { auth, db, storage } from "../../firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { ListingUpload } from "../../types/listing.types";
import Button from "../../components/button/Button";
import { LISTINGS_PAGE1_CACHE_KEY } from "../../constants/cache";
import { getMyListingsCacheKey } from "../../utils/cache";

export default function CreateListingPage() {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const selectedFiles = Array.from(files);

    setImageFiles((prev) => [...prev, ...selectedFiles]);
    setImagePreviews((prev) => [
      ...prev,
      ...selectedFiles.map((file) => URL.createObjectURL(file)),
    ]);

    e.target.value = "";
  };

  const uploadImages = async () => {
    const uploadedUrls: string[] = [];

    for (const file of imageFiles) {
      try {
        const imageRef = ref(
          storage,
          `listings/${auth.currentUser!.uid}/${crypto.randomUUID()}-${file.name}`
        );

        await uploadBytes(imageRef, file);

        const url = await getDownloadURL(imageRef);
        uploadedUrls.push(url);
      } catch (err) {
        console.error(`Failed to upload ${file.name}`, err);
      }
    }

    return uploadedUrls;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth.currentUser) {
      alert("not logged in");
      return;
    }

    try {
      setSubmitting(true);

      // Storage is not enabled yet. Keep uploadImages ready, but skip the call for now.
      // const imageUrls = await uploadImages();
      const imageUrls: string[] = [];

      const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      const userAvatar = userSnap.exists()
        ? (userSnap.data().avatar as string | undefined)?.trim() || null
        : null;

      const listing: ListingUpload = {
        title,
        price,
        description,
        images: imageUrls,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName,
        userAvatar,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "listings"), listing);

      localStorage.removeItem(LISTINGS_PAGE1_CACHE_KEY);
      localStorage.removeItem(getMyListingsCacheKey(auth.currentUser.uid));

      alert("Listing created");

      setTitle("");
      setPrice(0);
      setDescription("");
      setImageFiles([]);
      setImagePreviews([]);
    } catch (error) {
      console.error(error);
      alert("Failed to create listing");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="listing-container">
      <h1>Create Listing</h1>

      <form onSubmit={handleSubmit}>
        <input
          required
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          required
          type="number"
          min="0"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />

        <textarea
          required
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleImageUpload}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {imagePreviews.map((img, i) => (
            <img
              key={img}
              src={img}
              alt={`Preview ${i + 1}`}
              style={{
                width: 100,
                height: 100,
                objectFit: "cover",
              }}
            />
          ))}
        </div>

        <Button type="submit" disabled={submitting} variant="primary">
          {submitting ? "Creating..." : "Create"}
        </Button>
      </form>
    </div>
  );
}
