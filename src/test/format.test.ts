import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const ASN1_BEFORE_FORMATTING: string = `
SelectedAttributeTypes {joint-iso-itu-t ds(  5  ) module  (1) selectedAttributeTypes(5)  9  } DEFINITIONS ::= BEGIN IMPORTS
  -- from Rec. ITU-T X.501 | ISO/IEC 9594-2

  id-at, id-avc, id, id-asx, id-cat,    id-coat, id-lmr, id-lsx, id-mr, id-not, id-pr
    FROM UsefulDefinitions
      {joint-iso-itu-t ds(5) module(1) usefulDefinitions(0) 9} WITH SUCCESSORS

  Attribute{}, ATTRIBUTE, AttributeType, AttributeValueAssertion, CONTEXT,
  ContextAssertion, DistinguishedName, distinguishedNameMatch,
  MAPPING-BASED-MATCHING{}, MATCHING-RULE, OBJECT-CLASS,
  objectIdentifierMatch, SubtreeSpecification, SupportedAttributes, SYNTAX-NAME
    FROM InformationFramework
      {joint-iso-itu-t ds(5) module(1) informationFramework(1) 9} WITH SUCCESSORS

  AttributeCombination, ContextCombination, MRMapping
    FROM ServiceAdministration
      {joint-iso-itu-t ds(5) module(1) serviceAdministration(33) 9} WITH SUCCESSORS

  AttributeTypeDescription, DITContentRuleDescription, DITStructureRuleDescription, MatchingRuleDescription, MatchingRuleUseDescription, NameFormDescription, ObjectClassDescription
    FROM SchemaAdministration
      {joint-iso-itu-t ds(5) module(1) schemaAdministration(23) 9} WITH SUCCESSORS

  -- from Rec. ITU-T X.509 | ISO/IEC 9594-8

  AlgorithmIdentifier{}, Certificate, CertificateList, CertificatePair,
  SupportedAlgorithm, SupportedAlgorithms
     FROM AuthenticationFramework
       {joint-iso-itu-t ds(5) module(1) authenticationFramework(7) 9} WITH SUCCESSORS

  G3FacsimileNonBasicParameters
    FROM PkiPmiExternalDataTypes
      {joint-iso-itu-t ds(5) module(1) pkiPmiExternalDataTypes(40) 9} WITH SUCCESSORS
 -- from Rec. ITU-T X.511 | ISO/IEC 9594-3
  FilterItem, HierarchySelections, SearchControlOptions, ServiceControlOptions
    FROM DirectoryAbstractService
      {joint-iso-itu-t ds(5) module(1) directoryAbstractService(2) 9} WITH SUCCESSORS

 -- from Rec. ITU-T X.520 | ISO/IEC 9594-6

  PwdAlphabet, PwdVocabulary, UserPwd
     FROM PasswordPolicy
       {joint-iso-itu-t ds(5) module(1) passwordPolicy(39) 9} WITH SUCCESSORS ;

message PrintableString ::= "hi mom"

END -- SelectedAttributeTypes
`;

const EXPECTED_ASN1_AFTER_FORMATTING: string = `
SelectedAttributeTypes
{joint-iso-itu-t ds(5) module(1) selectedAttributeTypes(5) 9}
DEFINITIONS ::=
BEGIN
IMPORTS
  -- from Rec. ITU-T X.501 | ISO/IEC 9594-2

  id-at, id-avc, id, id-asx, id-cat, id-coat, id-lmr, id-lsx, id-mr, id-not,
  id-pr
    FROM UsefulDefinitions
    {joint-iso-itu-t ds(5) module(1) usefulDefinitions(0) 9}
    WITH SUCCESSORS

  Attribute{}, ATTRIBUTE, AttributeType, AttributeValueAssertion, CONTEXT,
  ContextAssertion, DistinguishedName, distinguishedNameMatch,
  MAPPING-BASED-MATCHING{}, MATCHING-RULE, OBJECT-CLASS, objectIdentifierMatch,
  SubtreeSpecification, SupportedAttributes, SYNTAX-NAME
    FROM InformationFramework
    {joint-iso-itu-t ds(5) module(1) informationFramework(1) 9}
    WITH SUCCESSORS

  AttributeCombination, ContextCombination, MRMapping
    FROM ServiceAdministration
    {joint-iso-itu-t ds(5) module(1) serviceAdministration(33) 9}
    WITH SUCCESSORS

  AttributeTypeDescription, DITContentRuleDescription,
  DITStructureRuleDescription, MatchingRuleDescription,
  MatchingRuleUseDescription, NameFormDescription, ObjectClassDescription
    FROM SchemaAdministration
    {joint-iso-itu-t ds(5) module(1) schemaAdministration(23) 9}
    WITH SUCCESSORS

  -- from Rec. ITU-T X.509 | ISO/IEC 9594-8

  AlgorithmIdentifier{}, Certificate, CertificateList, CertificatePair,
  SupportedAlgorithm, SupportedAlgorithms
    FROM AuthenticationFramework
    {joint-iso-itu-t ds(5) module(1) authenticationFramework(7) 9}
    WITH SUCCESSORS

  G3FacsimileNonBasicParameters
    FROM PkiPmiExternalDataTypes
    {joint-iso-itu-t ds(5) module(1) pkiPmiExternalDataTypes(40) 9}
    WITH SUCCESSORS
 -- from Rec. ITU-T X.511 | ISO/IEC 9594-3
  FilterItem, HierarchySelections, SearchControlOptions, ServiceControlOptions
    FROM DirectoryAbstractService
    {joint-iso-itu-t ds(5) module(1) directoryAbstractService(2) 9}
    WITH SUCCESSORS

 -- from Rec. ITU-T X.520 | ISO/IEC 9594-6

  PwdAlphabet, PwdVocabulary, UserPwd
    FROM PasswordPolicy
    {joint-iso-itu-t ds(5) module(1) passwordPolicy(39) 9}
    WITH SUCCESSORS
  ;

message PrintableString ::= "hi mom"

END -- SelectedAttributeTypes
`;

suite('Formatting', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('Correctly formats', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_BEFORE_FORMATTING,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand("editor.action.formatDocument");
        await new Promise((r) => setTimeout(r, 1000));
        const actualText = document.getText();
        assert.equal(actualText, EXPECTED_ASN1_AFTER_FORMATTING);
    });

});
