import { describe, expect, it } from "vitest";
import { toFrench } from "../../app/translate";

describe("the page in French", () => {
  it("translates the CapCut phases and the current effect", () => {
    expect(toFrench("Effect 3/7")).toBe("Effet 3/7");
    expect(toFrench("Preparing CapCut export")).toBe("Préparation de l’export CapCut");
    expect(toFrench("Copying CapCut media")).toBe("Copie des médias CapCut");
    expect(toFrench("Writing CapCut project")).toBe("Écriture du projet CapCut");
  });

  it("translates exact interface texts and keeps their spacing", () => {
    expect(toFrench("SEND")).toBe("ENVOYER");
    expect(toFrench("  · STEP ")).toBe("  · ÉTAPE ");
  });
  it("translates texts that carry a name or a letter", () => {
    expect(toFrench("Accroche: what do you want?")).toBe("Accroche : que veux-tu ?");
    expect(toFrench("NEXT · PICK A VARIANT, THEN PRESS CHOOSE B.")).toBe("SUITE · CHOISIS UNE VARIANTE, PUIS APPUIE SUR CHOISIR B.");
  });
  it("leaves the creator's content and French alone", () => {
    expect(toFrench("Is there another way I can get in Station F ?")).toBeNull();
    expect(toFrench("ENVOYER")).toBeNull();
  });
});
